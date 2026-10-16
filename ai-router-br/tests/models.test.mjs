import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { parseCandidate, ladderFor, forcedCandidate, resolveCodexCommand, codexModels, deepseekKeyState, resolveCandidate, unavailableReason, deepseekFit, detectHost, DEFAULT_ROUTING } from '../lib/models.mjs';
import { classifyTask } from '../lib/classifier.mjs';
import { hardenConfig } from '../lib/config.mjs';
import { parseYaml } from '../lib/simple-yaml.mjs';
import { route } from '../lib/router.mjs';
import { codexWorker } from '../workers/codex-worker.mjs';
import { deepseekWorker } from '../workers/deepseek-worker.mjs';
import { ensureInitialized } from '../lib/bootstrap.mjs';
import { summaryLine, SUMMARY_PREFIX } from '../lib/summary.mjs';
import { repo,rm,baseConfig,fakeCodexRepo,fakeCodexConfig,mockDeepSeek,deepseekReply,withEnv,probeFor,FAKE_DS_KEY } from './helpers.mjs';

const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const template=()=>parseYaml(fs.readFileSync(path.join(pluginRoot,'templates','config.yml'),'utf8'));
const task=(extra={})=>({id:'TASK-M',objective:'Implementar feature',allowed_files:['a.txt'],relevant_files:['a.txt'],forbidden_files:[],tests:[],budget:{profile:'normal'},max_attempts:2,...extra});
const tmp=prefix=>fs.mkdtempSync(path.join(os.tmpdir(),prefix));
const touch=(p,c='x')=>{ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,c); return p; };
const okWorker=(executor,seen)=>async({candidate})=>{ seen.push({executor,...(candidate?.model?{model:candidate.model}:{}),...(candidate?.effort?{effort:candidate.effort}:{})}); return {task_id:'TASK-M',executor,status:'success',changed_files:['a.txt'],patch:'+x'}; };
const downWorker=(executor,seen,error_code='api_unavailable')=>async({candidate})=>{ seen.push({executor,...(candidate?.model?{model:candidate.model}:{})}); return {task_id:'TASK-M',executor,status:'failed',unavailable:true,error:error_code,error_code}; };

test('ladder entries parse strictly and the template matches the built-in ladder',()=>{
  assert.deepEqual(parseCandidate('codex:gpt-6-luna:low'),{executor:'codex',model:'gpt-6-luna',effort:'low'});
  assert.deepEqual(parseCandidate('codex:gpt-6.1-sol'),{executor:'codex',model:'gpt-6.1-sol',effort:null});
  assert.deepEqual(parseCandidate('deepseek'),{executor:'deepseek'});
  assert.deepEqual(parseCandidate('claude:haiku'),{executor:'claude',model:'haiku',agent:'ai-router-br:claude-worker-haiku'});
  for (const bad of ['codex','codex:gpt;rm:low','codex:x:turbo','deepseek:other','claude:opus','claude:constructor','main','codex:a:low:extra','']) assert.equal(parseCandidate(bad),null,bad);
  assert.deepEqual(template().routing,DEFAULT_ROUTING);
  // Frontier model never appears in the automatic ladder.
  assert.ok(!JSON.stringify(DEFAULT_ROUTING).includes('astra'));
});

test('project routing can drop or reorder rungs, never add a model or a complexity',()=>{
  const {config,ignored}=hardenConfig(template(),{routing:{simple:['codex:gpt-6-luna:medium','codex:gpt-6-astra:ultra','deepseek'],standard:'codex:gpt-6-astra:max',frontier:['codex:gpt-6-astra:ultra']}});
  assert.deepEqual(config.routing.simple,['codex:gpt-6-luna:medium','deepseek']);
  assert.deepEqual(config.routing.standard,DEFAULT_ROUTING.standard);
  assert.equal(config.routing.frontier,undefined);
  for (const k of ['routing.simple','routing.standard','routing.frontier']) assert.ok(ignored.includes(k),k);
  assert.deepEqual(ladderFor(config,'mechanical').map(c=>c.executor),['deepseek','codex','claude']);
  // Configs without routing (older tests, older projects) still get the plugin ladder.
  assert.equal(ladderFor({},'complex')[0].model,'gpt-6.1-sol');
});

test('complexity: declared wins, tiers map to rungs, a mapped plan lowers one rung, complexity signals raise it',()=>{
  const c=(o)=>classifyTask(o,{router:{small_task_direct:false}});
  assert.equal(c({objective:'Criar componente de listagem',allowed_files:['a.tsx']}).complexity,'standard');
  assert.equal(c({objective:'Gerar boilerplate de documentação repetitiva'}).complexity,'simple');
  assert.equal(c({objective:'Listar referências do hook'}).complexity,'mechanical');
  const planned=c({objective:'Criar componente de listagem',steps:['src/a.tsx: adicionar tabela']});
  assert.equal(planned.complexity,'simple'); assert.equal(planned.complexity_source,'inferred_with_plan'); assert.equal(planned.executor,'deepseek');
  assert.equal(c({objective:'Refatorar arquitetura do módulo de agenda'}).complexity,'complex');
  assert.equal(c({objective:'Implementar tela',allowed_files:Array.from({length:16},(_,i)=>`f${i}.ts`)}).complexity,'complex');
  assert.equal(c({objective:'Investigar race condition no worker'}).complexity,'standard');
  assert.equal(c({objective:'Refatorar arquitetura',complexity:'Mechanical'}).complexity,'mechanical');
  // Complexity never touches risk: TIER 0 stays main whatever is declared.
  const t0=c({objective:'Alterar autenticação e RLS em produção',complexity:'mechanical'});
  assert.equal(t0.tier,0); assert.equal(t0.executor,'main');
});

test('dry-run walks the ladder by availability: cheap first, Claude subagent before the main model',async()=>{
  const d=repo(); const t=task({complexity:'simple'});
  const ok=await route({root:d,task:t,config:baseConfig(),dryRun:true,probe:probeFor({host:'claude'})});
  assert.equal(ok.executor,'deepseek'); assert.deepEqual(ok.fallback_chain,[{executor:'codex',model:'gpt-6-luna',effort:'medium'},{executor:'claude',model:'haiku',agent:'ai-router-br:claude-worker-haiku'}]);
  const noKey=await route({root:d,task:t,config:baseConfig(),dryRun:true,probe:probeFor({host:'claude',deepseek_key:'malformed'})});
  assert.equal(noKey.executor,'codex'); assert.equal(noKey.model,'gpt-6-luna'); assert.equal(noKey.effort,'medium');
  assert.deepEqual(noKey.skipped_candidates,[{executor:'deepseek',reason:'deepseek_key_malformed'}]);
  const none=await route({root:d,task:t,config:baseConfig(),dryRun:true,probe:probeFor({host:'claude',deepseek_key:'malformed',codex_command:null})});
  assert.equal(none.executor,'claude'); assert.equal(none.claude_agent,'ai-router-br:claude-worker-haiku'); assert.equal(none.review_required,true);
  const elsewhere=await route({root:d,task:t,config:baseConfig(),dryRun:true,probe:probeFor({deepseek_key:'missing',codex_command:null})});
  assert.equal(elsewhere.executor,'main'); assert.ok(elsewhere.reasons.includes('nenhum worker disponível nesta máquina'));
  const std=await route({root:d,task:task(),config:baseConfig(),dryRun:true,probe:probeFor()});
  assert.equal(std.complexity,'standard'); assert.equal(std.model,'gpt-6.1-sol'); assert.equal(std.effort,'low');
  rm(d);
});

test('dispatch: claude rung is a handoff to the subagent, recorded without running anything',async()=>{
  const d=repo(); const seen=[];
  const r=await route({root:d,task:task({complexity:'mechanical'}),config:baseConfig(),probe:probeFor({host:'claude',deepseek_key:'missing',codex_command:null}),workers:{codex:okWorker('codex',seen),deepseek:okWorker('deepseek',seen)}});
  assert.equal(r.status,'delegate_claude'); assert.equal(r.executor,'claude'); assert.equal(r.model,'haiku'); assert.equal(r.claude_agent,'ai-router-br:claude-worker-haiku');
  assert.deepEqual(seen,[]);
  const costs=fs.readFileSync(path.join(d,'.ai-router','COSTS.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  assert.equal(costs.at(-1).executor,'claude'); assert.equal(costs.at(-1).status,'delegate_claude');
  rm(d);
});

test('dispatch: unavailable rungs fall through in order with the rung model; a whole executor down skips its other models',async()=>{
  const d=repo(); const seen=[];
  const r=await route({root:d,task:task({complexity:'simple'}),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{deepseek:downWorker('deepseek',seen),codex:okWorker('codex',seen)}});
  assert.equal(r.status,'success'); assert.equal(r.executor,'codex'); assert.equal(r.model,'gpt-6-luna'); assert.equal(r.effort,'medium');
  assert.equal(r.fallback,true); assert.equal(r.previous_executor,'deepseek'); assert.deepEqual(seen.map(s=>s.executor),['deepseek','codex']);
  assert.match(summaryLine(r,baseConfig()),/TIER 1 · simple → DeepSeek \(deepseek-flash\) indisponível → Codex \(gpt-6-luna · medium\) · sucesso/);
  // Model not on this account -> next Codex model; login failure -> no other Codex model, straight to the subagent.
  const s2=[]; let n=0;
  const modelDown=async(o)=>{ n++; return n===1?downWorker('codex',s2,'model_unavailable')(o):okWorker('codex',s2)(o); };
  // Each dispatch records into .ai-router/ (not git-excluded in a bare test repo): a fresh repo per scenario.
  const d2=repo(); const d3=repo();
  const r2=await route({root:d2,task:task({complexity:'standard'}),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{codex:modelDown,deepseek:okWorker('deepseek',s2)}});
  assert.deepEqual(s2,[{executor:'codex',model:'gpt-6.1-sol'},{executor:'codex',model:'gpt-6-sol',effort:'low'}]); assert.equal(r2.model,'gpt-6-sol');
  const s3=[];
  const r3=await route({root:d3,task:task({complexity:'complex'}),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{codex:downWorker('codex',s3,'auth_unavailable'),deepseek:okWorker('deepseek',s3)}});
  assert.deepEqual(s3,[{executor:'codex',model:'gpt-6.1-sol'}]);
  assert.equal(r3.status,'delegate_claude'); assert.equal(r3.claude_agent,'ai-router-br:claude-worker-sonnet'); assert.equal(r3.previous_error_code,'auth_unavailable');
  assert.match(summaryLine(r3,baseConfig()),/Codex \(gpt-6\.1-sol · high\) indisponível → Claude Sonnet \(subagente\) · delegado ao subagente/);
  rm(d); rm(d2); rm(d3);
});

test('dispatch: a failure that must not fall back suggests the Claude subagent for the fix',async()=>{
  const d=repo(); const seen=[];
  const failing=async()=>({task_id:'TASK-M',executor:'codex',status:'failed',unavailable:false,error:'tests_failed',error_code:'tests_failed',patch:'+x'});
  const r=await route({root:d,task:task(),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{codex:failing,deepseek:okWorker('deepseek',seen)}});
  assert.equal(r.status,'failed'); assert.equal(r.fallback,false); assert.deepEqual(seen,[]);
  assert.deepEqual(r.suggested_next,{executor:'claude',model:'sonnet',agent:'ai-router-br:claude-worker-sonnet'});
  rm(d);
});

test('forced executor takes model/effort from the flag or the ladder; astra only when asked',()=>{
  assert.deepEqual(forcedCandidate('codex',{},{},'simple'),{executor:'codex',model:'gpt-6-luna',effort:'medium'});
  assert.deepEqual(forcedCandidate('codex',{model:'gpt-6-astra'},{},'simple'),{executor:'codex',model:'gpt-6-astra',effort:null});
  assert.deepEqual(forcedCandidate('claude',{},{},'complex'),{executor:'claude',model:'sonnet',agent:'ai-router-br:claude-worker-sonnet'});
  assert.throws(()=>forcedCandidate('codex',{model:'x; rm -rf'},{},'simple'),/invalid_model/);
  assert.throws(()=>forcedCandidate('codex',{effort:'turbo'},{},'simple'),/invalid_effort/);
  assert.throws(()=>forcedCandidate('claude',{model:'opus'},{},'simple'),/invalid_model/);
});

test('codex worker passes the rung model and effort to codex exec',async()=>{
  const out=path.join(tmp('router-args-'),'args.json');
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},dump_args_to:out});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig(),candidate:{executor:'codex',model:'gpt-6-luna',effort:'low'}});
  assert.equal(r.status,'success',r.error); assert.equal(r.model,'gpt-6-luna'); assert.equal(r.effort,'low');
  const args=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(args[args.indexOf('-m')+1],'gpt-6-luna'); assert.equal(args[args.indexOf('-c')+1],'model_reasoning_effort="low"');
  rm(d); rm(path.dirname(out));
});

test('codex worker: a model the account cannot use is model_unavailable; the task text cannot fake it',async()=>{
  const d=fakeCodexRepo({exit:1,stderr:"ERROR: The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account."});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig(),candidate:{executor:'codex',model:'gpt-6.1-sol',effort:'low'}});
  assert.equal(r.error_code,'model_unavailable'); assert.equal(r.unavailable,true); rm(d);
  const e=fakeCodexRepo({exit:3,echo_prompt:true,stderr:'panic: unexpected'});
  const r2=await codexWorker({root:e,task:task({objective:'Tratar erro "model is not supported" na UI'}),config:fakeCodexConfig(),candidate:{executor:'codex',model:'gpt-6-luna'}});
  assert.equal(r2.unavailable,false); rm(e);
});

test('codex binary: env override, PATH .exe, npm .cmd through node, desktop app build, nothing',()=>{
  const root=tmp('router-codex-bin-');
  try {
    const exe=touch(path.join(root,'bin','codex.exe'));
    assert.deepEqual(resolveCodexCommand('codex',{PATH:path.join(root,'bin')},'win32'),[exe]);
    const npmDir=path.join(root,'npm'); touch(path.join(npmDir,'codex.cmd')); const js=touch(path.join(npmDir,'node_modules','@openai','codex','bin','codex.js'));
    assert.deepEqual(resolveCodexCommand('codex',{PATH:npmDir},'win32'),[process.execPath,js]);
    // A bare `codex` shell script on Windows PATH cannot be spawned: not picked.
    touch(path.join(root,'sh','codex'));
    const local=path.join(root,'local'); const older=touch(path.join(local,'OpenAI','Codex','bin','aaa','codex.exe')); const newer=touch(path.join(local,'OpenAI','Codex','bin','bbb','codex.exe'));
    fs.utimesSync(older,new Date(1000),new Date(1000));
    assert.deepEqual(resolveCodexCommand('codex',{PATH:path.join(root,'sh'),LOCALAPPDATA:local},'win32'),[newer]);
    assert.deepEqual(resolveCodexCommand('codex',{PATH:path.join(root,'sh')},'linux'),[path.join(root,'sh','codex')]);
    assert.deepEqual(resolveCodexCommand('codex',{PATH:path.join(root,'none'),AI_ROUTER_CODEX_BIN:exe},'win32'),[exe]);
    assert.equal(resolveCodexCommand('codex',{PATH:path.join(root,'none'),AI_ROUTER_CODEX_BIN:'relative/codex.exe'},'win32'),null);
    assert.deepEqual(resolveCodexCommand('/opt/custom/codex',{},'linux'),['/opt/custom/codex']);
  } finally { rm(root); }
});

test('codex models cache: unlisted model is unavailable, unsupported effort falls back to the model default',()=>{
  const home=tmp('router-codex-home-');
  try {
    assert.equal(codexModels({CODEX_HOME:home}),null);
    fs.writeFileSync(path.join(home,'models_cache.json'),JSON.stringify({fetched_at:'2026-10-16T00:00:00Z',models:[{slug:'gpt-6-luna',supported_reasoning_levels:JSON.stringify([{effort:'low'},{effort:'medium'}])},{slug:'gpt-6-sol',supported_reasoning_levels:[{effort:'low'},{effort:'ultra'}]}]}));
    const m=codexModels({CODEX_HOME:home});
    assert.deepEqual([...m.models.keys()],['gpt-6-luna','gpt-6-sol']);
    const probe=probeFor({codex_models:m});
    assert.equal(unavailableReason({executor:'codex',model:'gpt-6.1-sol'},probe),'codex_model_not_listed');
    assert.equal(unavailableReason({executor:'codex',model:'gpt-6-luna'},probe),null);
    assert.equal(resolveCandidate({executor:'codex',model:'gpt-6-luna',effort:'ultra'},probe).effort,null);
    assert.equal(resolveCandidate({executor:'codex',model:'gpt-6-sol',effort:'ultra'},probe).effort,'ultra');
    assert.equal(unavailableReason({executor:'codex',model:'anything'},probeFor()),null);
    assert.equal(unavailableReason({executor:'claude',model:'haiku'},probeFor()),'claude_host_required');
  } finally { rm(home); }
});

test('deepseek key shape: a Ctrl+V keystroke or placeholder is malformed, and host detection follows Claude Code',()=>{
  assert.equal(deepseekKeyState({}),'missing');
  assert.equal(deepseekKeyState({DEEPSEEK_API_KEY:String.fromCharCode(22)}),'malformed');
  // Built at runtime so the source never holds a secret-shaped literal (security-audit scans for them).
  const shaped=['sk','0123456789abcdef'.repeat(2)].join('-');
  for (const bad of ['your-key-here','sk-abc def ghi jkl mno pq',` ${shaped}`,`${shaped}\n`]) assert.equal(deepseekKeyState({DEEPSEEK_API_KEY:bad}),'malformed',JSON.stringify(bad));
  assert.equal(deepseekKeyState({DEEPSEEK_API_KEY:shaped}),'ok');
  assert.equal(detectHost({CLAUDECODE:'1'}),'claude'); assert.equal(detectHost({}),'other'); assert.equal(detectHost({CLAUDECODE:'1',AI_ROUTER_HOST:'other'}),'other');
});

test('deepseek worker: malformed key never reaches the network and is reported as such',async()=>{
  const d=repo(); const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end('{}');});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  const r=await withEnv({DEEPSEEK_API_KEY:String.fromCharCode(22)},()=>deepseekWorker({root:d,task:task(),config:c}));
  await ds.close();
  assert.equal(r.error,'deepseek_api_key_malformed'); assert.equal(r.error_code,'auth_unavailable'); assert.equal(r.unavailable,true); assert.equal(ds.requests.length,0); assert.equal(r.attempts,0);
  rm(d);
});

test('deepseek worker: a request fetch() refuses is request_invalid, not a network outage, and is not retried',async(t)=>{
  const d=repo(); const real=globalThis.fetch; let calls=0;
  globalThis.fetch=async()=>{ calls++; throw Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('invalid header'),{code:'UND_ERR_INVALID_ARG'})}); };
  try {
    const r=await withEnv({DEEPSEEK_API_KEY:FAKE_DS_KEY},()=>deepseekWorker({root:d,task:task(),config:baseConfig()}));
    assert.equal(r.error_code,'request_invalid'); assert.equal(r.error,'deepseek_request_rejected:UND_ERR_INVALID_ARG'); assert.equal(r.unavailable,true); assert.equal(calls,1);
  } finally { globalThis.fetch=real; rm(d); }
});

test('deepseek worker: truncated answer and empty content are fallback-eligible; empty content is retried once',async()=>{
  const d=repo();
  const trunc=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"summary":"s","changes":[{"path":"a.txt","content":"ok'}}],usage:{prompt_tokens:10,completion_tokens:10}}));});
  const c=baseConfig(); c.deepseek.base_url=trunc.url;
  const r=await withEnv({DEEPSEEK_API_KEY:FAKE_DS_KEY},()=>deepseekWorker({root:d,task:task(),config:c}));
  await trunc.close();
  assert.equal(r.error_code,'output_truncated'); assert.equal(r.unavailable,true); assert.equal(trunc.requests.length,1); assert.ok(r.cost_usd>0);
  const empty=await mockDeepSeek((req,res,body,n)=>{res.writeHead(200);res.end(n===1?JSON.stringify({choices:[{message:{content:''}}],usage:{}}):deepseekReply({summary:'s',changes:[{path:'a.txt',content:'ok\n'}]}));});
  c.deepseek.base_url=empty.url;
  const r2=await withEnv({DEEPSEEK_API_KEY:FAKE_DS_KEY},()=>deepseekWorker({root:d,task:task(),config:c}));
  await empty.close();
  assert.equal(r2.status,'success',r2.error); assert.equal(r2.attempts,2);
  rm(d);
});

test('deepseek fit: tasks it cannot see, would truncate or cannot answer in one reply skip the rung',()=>{
  const d=repo({'a.txt':'hello\n','big.ts':'x'.repeat(70000),'mid.ts':'y'.repeat(50000),'src/other.ts':'z\n'});
  const c=baseConfig(); c.deepseek.max_output_tokens=10000; c.deepseek.max_context_chars=400000;
  try {
    assert.equal(deepseekFit(d,task(),c),null);
    assert.equal(deepseekFit(d,task({relevant_files:['src/other.ts']}),c),'deepseek_needs_unsent_files');
    assert.equal(deepseekFit(d,task({allowed_files:['big.ts'],relevant_files:[]}),c),'deepseek_file_too_large');
    assert.equal(deepseekFit(d,task({allowed_files:['mid.ts'],relevant_files:[]}),c),'deepseek_output_too_large');
    c.deepseek.max_context_chars=20000;
    assert.equal(deepseekFit(d,task({allowed_files:['a.txt'],relevant_files:[]}),c),null);
    assert.equal(deepseekFit(d,task({allowed_files:['a.txt','mid.ts'],relevant_files:[]}),{...c,deepseek:{...c.deepseek,max_output_tokens:100000}}),'deepseek_context_too_large');
  } finally { rm(d); }
});

test('auto-init upgrades a config that is still a previous template, never an edited one',()=>{
  const old=fs.readFileSync(path.join(pluginRoot,'tests','fixtures','config-1.3.4.yml'),'utf8');
  const fresh=fs.readFileSync(path.join(pluginRoot,'templates','config.yml'),'utf8');
  for (const [content,upgraded] of [[old,true],[old.replace(/\r?\n/g,'\r\n'),true],[old.replace('timeout_ms: 180000','timeout_ms: 120000'),false]]) {
    const d=repo(); fs.mkdirSync(path.join(d,'.ai-router'),{recursive:true}); fs.writeFileSync(path.join(d,'.ai-router','config.yml'),content);
    const r=ensureInitialized(d,pluginRoot,{env:{}});
    assert.equal(r.status,'existing'); assert.equal(Boolean(r.config_upgraded),upgraded);
    assert.equal(fs.readFileSync(path.join(d,'.ai-router','config.yml'),'utf8'),upgraded?fresh:content);
    rm(d);
  }
});

test('summary lines for the ladder: rung model, unavailable rungs and the subagent handoff',()=>{
  const cfg={deepseek:{model:'deepseek-flash'},codex:{}}; const opts={codexModel:()=>'gpt-user-config'};
  assert.equal(summaryLine({status:'dry-run',tier:1,complexity:'simple',executor:'codex',model:'gpt-6-luna',effort:'medium',fallback_chain:[{executor:'claude',model:'haiku'}],skipped_candidates:[{executor:'deepseek',reason:'deepseek_key_malformed'}]},cfg,opts),
    `${SUMMARY_PREFIX} · TIER 1 · simple → Codex (gpt-6-luna · medium) · fallback: Claude Haiku (subagente) · classificação · indisponível: deepseek_key_malformed`);
  assert.equal(summaryLine({status:'delegate_claude',tier:2,complexity:'mechanical',executor:'claude',model:'haiku',external_blocked:'dirty_worktree'},cfg,opts),
    `${SUMMARY_PREFIX} · TIER 2 · mechanical → workers externos bloqueados (dirty_worktree) → Claude Haiku (subagente) · delegado ao subagente`);
  assert.equal(summaryLine({status:'main_required',tier:1,executor:'main',skipped_candidates:[{reason:'codex_not_found'},{reason:'claude_host_required'}]},cfg,opts),
    `${SUMMARY_PREFIX} · TIER 1 → agente principal · indisponível: codex_not_found, claude_host_required`);
  assert.equal(summaryLine({status:'failed',tier:1,complexity:'standard',executor:'codex',model:'gpt-6.1-sol',effort:'low',error_code:'tests_failed',duration_ms:2000,suggested_next:{executor:'claude',model:'sonnet'}},cfg,opts),
    `${SUMMARY_PREFIX} · TIER 1 · standard → Codex (gpt-6.1-sol · low) · falhou (tests_failed) · sem custo de API · 2,0 s · correção: Claude Sonnet (subagente)`);
});

test('review: a Claude-first rung still validates the TASK PACKAGE before the handoff',async()=>{
  const d=repo(); const probe=probeFor({host:'claude',deepseek_key:'missing',codex_command:null});
  for (const [extra,code] of [[{tests:['git push origin main']},'forbidden_command'],[{tests:['npx vitest']},'unsafe_test_command'],[{allowed_files:['../x']},'path_traversal'],[{allowed_files:['src/*.js']},'glob_not_supported']]) {
    const t=task({complexity:'simple',...extra});
    const dry=await route({root:d,task:t,config:baseConfig(),dryRun:true,probe});
    assert.equal(dry.executor,'claude'); assert.equal(dry.dispatch_error,code,code);
    const r=await route({root:d,task:t,config:baseConfig(),probe});
    assert.equal(r.status,'blocked',code); assert.equal(r.error_code,code,code);
  }
  // The external-only note is not shown for a subagent, which reads the tree itself.
  const dry=await route({root:d,task:task({complexity:'simple',relevant_files:['src/other.ts']}),config:baseConfig(),dryRun:true,probe});
  assert.equal(dry.executor,'claude'); assert.equal(dry.relevant_not_sent,undefined);
  rm(d);
});

test('review: safety-gate failures never suggest the subagent; costs of every paid rung add up',async()=>{
  for (const code of ['scope_violation','budget_exceeded','max_files_exceeded','unsafe_config']) {
    const d=repo();
    const r=await route({root:d,task:task(),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{codex:async()=>({task_id:'TASK-M',executor:'codex',status:'failed',unavailable:false,error:code,error_code:code}),deepseek:async()=>{throw new Error('not reached');}}});
    assert.equal(r.suggested_next,undefined,code); rm(d);
  }
  const d=repo();
  const truncated=async()=>({task_id:'TASK-M',executor:'deepseek',status:'failed',unavailable:true,error:'deepseek_output_truncated',error_code:'output_truncated',cost_usd:0.04});
  const ok=async()=>({task_id:'TASK-M',executor:'codex',status:'success',changed_files:['a.txt'],patch:'+x'});
  const r=await route({root:d,task:task({complexity:'simple'}),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{deepseek:truncated,codex:ok}});
  assert.equal(r.status,'success'); assert.equal(r.cost_usd,0.04);
  const e=repo();
  const h=await route({root:e,task:task({complexity:'simple'}),config:baseConfig(),probe:probeFor({host:'claude'}),workers:{deepseek:truncated,codex:async()=>({task_id:'TASK-M',executor:'codex',status:'failed',unavailable:true,error:'x',error_code:'auth_unavailable'})}});
  assert.equal(h.status,'delegate_claude'); assert.equal(h.cost_usd,0.04);
  rm(d); rm(e);
});

test('review: model-related text from the code being edited is not a model refusal',async()=>{
  for (const stderr of ['Error: model.pkl not found','the user model table does not exist','Unknown model field "price"']) {
    const d=fakeCodexRepo({exit:1,stderr});
    const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig(),candidate:{executor:'codex',model:'gpt-6-luna',effort:'low'}});
    assert.notEqual(r.error_code,'model_unavailable',stderr); rm(d);
  }
  const d=fakeCodexRepo({exit:1,stderr:'ERROR: The model `gpt-6-luna` does not exist or you do not have access to it.'});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig(),candidate:{executor:'codex',model:'gpt-6-luna'}});
  assert.equal(r.error_code,'model_unavailable'); assert.equal(r.error,'codex_model_unavailable:gpt-6-luna'); rm(d);
});

test('review: deepseek fit counts characters, and files under a directory allowlist as writable',()=>{
  const d=repo({'src/a.ts':'y'.repeat(50000),'wide.txt':'é'.repeat(30500)});
  const c=baseConfig(); c.deepseek.max_output_tokens=10000; c.deepseek.max_context_chars=400000;
  try {
    assert.equal(deepseekFit(d,task({allowed_files:['src/'],relevant_files:['src/a.ts']}),c),'deepseek_output_too_large');
    // 61,000 bytes but 30,500 characters: under max_file_chars (60000), so the reader would not truncate it.
    assert.equal(deepseekFit(d,task({allowed_files:['wide.txt'],relevant_files:[]}),{...c,deepseek:{...c.deepseek,max_output_tokens:100000}}),null);
  } finally { rm(d); }
});
