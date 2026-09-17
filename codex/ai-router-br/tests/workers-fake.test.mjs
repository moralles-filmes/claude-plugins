import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { codexWorker } from '../workers/codex-worker.mjs';
import { deepseekWorker } from '../workers/deepseek-worker.mjs';
import { route } from '../lib/router.mjs';
import { readAllowedFiles, forbiddenPatterns } from '../lib/security.mjs';
import { discardIgnoredFiles } from '../lib/worktree.mjs';
import { repo,rm,sh,baseConfig,fakeCodexRepo,fakeCodexConfig,mockDeepSeek,deepseekReply,withEnv } from './helpers.mjs';

const task=(extra={})=>({id:'TASK-F',objective:'Implementar feature',allowed_files:['a.txt'],relevant_files:['a.txt'],forbidden_files:[],tests:[],budget:{profile:'normal'},max_attempts:2,...extra});

test('codex worker: allowed change returns patch, runs tests, never touches main tree',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},message:'done'});
  const r=await codexWorker({root:d,task:task({tests:['node check.js']}),config:fakeCodexConfig()});
  assert.equal(r.status,'success',r.error); assert.deepEqual(r.changed_files,['a.txt']); assert.match(r.patch,/\+ok/); assert.equal(r.tests[0].ok,true);
  assert.equal(fs.readFileSync(path.join(d,'a.txt'),'utf8'),'hello\n');
  assert.equal(sh(d,['status','--porcelain']).stdout,'');
  assert.equal(sh(d,['worktree','list']).stdout.trim().split('\n').length,1);
  rm(d);
});
test('codex worker env has no secrets and is marked as worker',async()=>{
  const dump=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'router-env-')),'env.json');
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},dump_env_to:dump});
  await withEnv({OPENAI_API_KEY:'fake-openai-not-real',DEEPSEEK_API_KEY:'fake-ds-not-real',SMOKE_CANARY_TOKEN:'canary'},()=>codexWorker({root:d,task:task(),config:fakeCodexConfig()}));
  const keys=JSON.parse(fs.readFileSync(dump,'utf8')).map(k=>k.toUpperCase());
  for (const k of ['OPENAI_API_KEY','DEEPSEEK_API_KEY','SMOKE_CANARY_TOKEN']) assert.ok(!keys.includes(k),k);
  assert.ok(keys.includes('AI_ROUTER_WORKER'));
  rm(d); rm(path.dirname(dump));
});
test('codex worker: forbidden file inside a new directory is a scope violation without fallback',async()=>{
  const d=fakeCodexRepo({write:{'src/new/.env':'SECRET=1','src/new/ok.ts':'x'}});
  let fallbackCalled=false;
  const r=await route({root:d,task:task({allowed_files:['src/'],relevant_files:[]}),config:fakeCodexConfig(),forceExecutor:'codex',workers:{codex:codexWorker,deepseek:async()=>{fallbackCalled=true;return {status:'success'};}}});
  assert.equal(r.status,'failed'); assert.equal(r.error_code,'scope_violation'); assert.equal(r.fallback,false); assert.equal(fallbackCalled,false);
  rm(d);
});
test('codex worker: too many changed files is rejected without fallback',async()=>{
  const d=fakeCodexRepo({write:{'src/a.ts':'1','src/b.ts':'2','src/c.ts':'3'}});
  const c=fakeCodexConfig(); c.execution.max_files=2; let fallbackCalled=false;
  const r=await route({root:d,task:task({allowed_files:['src/'],relevant_files:[]}),config:c,forceExecutor:'codex',workers:{codex:codexWorker,deepseek:async()=>{fallbackCalled=true;return {status:'success'};}}});
  assert.equal(r.error_code,'max_files_exceeded'); assert.equal(r.unavailable,false); assert.equal(fallbackCalled,false);
  rm(d);
});
test('codex worker: commits are detected',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},commit:true});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig()});
  assert.equal(r.status,'failed'); assert.equal(r.error,'worker_committed'); assert.equal(r.unavailable,false);
  rm(d);
});
test('codex worker: broken tests are not masked by fallback',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'fail: auth not found\n'}});
  let fallbackCalled=false;
  const r=await route({root:d,task:task({tests:['node check.js']}),config:fakeCodexConfig(),forceExecutor:'codex',workers:{codex:codexWorker,deepseek:async()=>{fallbackCalled=true;return {status:'success'};}}});
  assert.equal(r.error_code,'tests_failed'); assert.equal(r.unavailable,false); assert.equal(fallbackCalled,false); assert.ok(r.patch);
  rm(d);
});
test('codex worker: read-only sandbox is reported as sandbox_unavailable (fallback-eligible)',async()=>{
  const d=fakeCodexRepo({message:'I could not apply the change: the sandbox is read-only.'});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig()});
  assert.equal(r.error_code,'sandbox_unavailable'); assert.equal(r.unavailable,true);
  rm(d);
});
test('codex worker: sandbox read-only failure really falls back to deepseek through the router',async()=>{
  const d=fakeCodexRepo({message:'I could not apply the change: the sandbox is read-only.'});
  let fallbackCalled=false;
  const r=await route({root:d,task:task(),config:fakeCodexConfig(),forceExecutor:'codex',workers:{codex:codexWorker,deepseek:async()=>{fallbackCalled=true;return {task_id:'TASK-F',executor:'deepseek',status:'success'};}}});
  assert.equal(fallbackCalled,true); assert.equal(r.fallback,true); assert.equal(r.previous_error_code,'sandbox_unavailable');
  assert.equal(sh(d,['worktree','list']).stdout.trim().split('\n').length,1);
  rm(d);
});
test('codex worker: tests are deferred to the main agent by default and never run worker code',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n','tamper.js':"require('fs').writeFileSync(process.argv[2],'ran');\n"}});
  const marker=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'router-marker-')),'ran.txt');
  const c=fakeCodexConfig(); delete c.execution.run_tests_in_worktree;
  const r=await codexWorker({root:d,task:task({allowed_files:['a.txt','tamper.js'],tests:[`node tamper.js ${marker.replaceAll('\\','/')}`]}),config:c});
  assert.equal(r.status,'success',r.error); assert.equal(r.tests_status,'deferred_to_main'); assert.equal(r.tests_pending.length,1);
  assert.equal(fs.existsSync(marker),false); assert.match(r.patch,/tamper\.js/);
  rm(d); rm(path.dirname(marker));
});
test('codex worker: files hidden by a worker .gitignore are discarded before tests and cannot touch the main repo',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n','.gitignore':'*\n','evil.test.js':"require('./tamper-main.js');require('node:test')('ok',()=>{});\n"}});
  const before=sh(d,['rev-parse','HEAD']).stdout.trim();
  const r=await codexWorker({root:d,task:task({tests:['node --test']}),config:fakeCodexConfig()});
  assert.equal(r.status,'success',r.error); assert.deepEqual(r.changed_files,['a.txt']);
  assert.deepEqual([...r.discarded_ignored_files].sort(),['.gitignore','evil.test.js']);
  assert.equal(fs.existsSync(path.join(d,'PWNED.txt')),false); assert.equal(sh(d,['rev-parse','HEAD']).stdout.trim(),before);
  rm(d);
});
test('codex worker: a link to outside the worktree fails validation and nothing behind it is deleted',async(t)=>{
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'router-outside-'));
  fs.writeFileSync(path.join(outside,'precious.log'),'keep'); fs.writeFileSync(path.join(outside,'keep.txt'),'keep');
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},link:{path:'link',target:outside}},{'.gitignore':'*.log\n'});
  try {
    const probe=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'router-probe-')),'l');
    try { fs.symlinkSync(outside,probe,'junction'); fs.unlinkSync(probe); } catch { t.skip('links not permitted here'); return; } finally { rm(path.dirname(probe)); }
    const r=await codexWorker({root:d,task:task({allowed_files:['a.txt','link/']}),config:fakeCodexConfig()});
    assert.equal(r.status,'failed'); assert.equal(r.error_code,'scope_violation'); assert.match(r.error,/worker_created_link:link/); assert.equal(r.unavailable,false);
    assert.deepEqual(fs.readdirSync(outside).sort(),['keep.txt','precious.log']);
    assert.equal(sh(d,['worktree','list']).stdout.trim().split('\n').length,1);
  } finally { rm(d); rm(outside); }
});
test('discardIgnoredFiles never deletes through a link',(t)=>{
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'router-outside-'));
  fs.writeFileSync(path.join(outside,'precious.log'),'keep');
  const d=repo({'a.txt':'x\n','.gitignore':'*.log\n'});
  fs.writeFileSync(path.join(d,'own.log'),'drop');
  try {
    try { fs.symlinkSync(outside,path.join(d,'link'),'junction'); } catch { t.skip('links not permitted here'); return; }
    // Git for Windows lists ignored files through a junction and the deletion has to be refused; POSIX git
    // never descends into a symlink, so there is nothing behind it to refuse. Either way the file outside
    // survives, nothing behind the link is reported as discarded and the worktree's own ignored file goes.
    let discarded=null;
    try { discarded=discardIgnoredFiles(d); }
    catch (e) { assert.equal(e.message,'ignored_files_not_removed'); assert.equal(e.code,'scope_violation'); }
    assert.equal(fs.readFileSync(path.join(outside,'precious.log'),'utf8'),'keep');
    assert.deepEqual(fs.readdirSync(outside),['precious.log']);
    assert.equal(fs.existsSync(path.join(d,'own.log')),false);
    if (discarded) assert.deepEqual(discarded.filter(p=>p.startsWith('link/')),[]);
  } finally { try{ fs.unlinkSync(path.join(d,'link')); }catch{} rm(d); rm(outside); }
});
test('codex worker: a visible test that writes to the main repo fails as scope_violation without fallback',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n','hijack.js':"require('./tamper-main.js');\n"}});
  let fallbackCalled=false;
  const r=await route({root:d,task:task({allowed_files:['a.txt','hijack.js'],tests:['node hijack.js']}),config:fakeCodexConfig(),forceExecutor:'codex',workers:{codex:codexWorker,deepseek:async()=>{fallbackCalled=true;return {status:'success'};}}});
  assert.equal(r.status,'failed'); assert.equal(r.error_code,'scope_violation'); assert.equal(r.error,'tests_modified_main_repository'); assert.equal(fallbackCalled,false);
  rm(d);
});
test('codex worker: a worker process that writes to the main repo fails as scope_violation',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'},tamper_main:true});
  const r=await codexWorker({root:d,task:task(),config:fakeCodexConfig()});
  assert.equal(r.status,'failed'); assert.equal(r.error,'worker_modified_main_repository'); assert.equal(r.unavailable,false);
  rm(d);
});
test('codex worker: danger-full-access sandbox is refused before running Codex',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'}});
  const c=fakeCodexConfig(); c.codex.sandbox='danger-full-access';
  const r=await codexWorker({root:d,task:task(),config:c});
  assert.equal(r.error_code,'unsafe_config'); assert.equal(r.unavailable,false); assert.equal(fs.readFileSync(path.join(d,'a.txt'),'utf8'),'hello\n');
  rm(d);
});
test('codex worker: login status must exit 0 and say ChatGPT',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'}});
  const r=await withEnv({FAKE_CODEX_LOGIN_EXIT:'1'},()=>codexWorker({root:d,task:task(),config:fakeCodexConfig()}));
  assert.equal(r.error_code,'auth_unavailable'); assert.equal(r.phase,'auth');
  rm(d);
});
test('codex worker: task text mentioning outages does not turn a crash into unavailability',async()=>{
  const objective='Handle 401 unauthorized and network timeout errors in the API client';
  const d=fakeCodexRepo({exit:3,echo_prompt:true,stderr:'panic: unexpected'});
  const r=await codexWorker({root:d,task:task({objective}),config:fakeCodexConfig()});
  assert.equal(r.status,'failed'); assert.equal(r.unavailable,false);
  rm(d);
});
test('codex worker: usage limit is unavailability; unknown exit is not',async()=>{
  const d1=fakeCodexRepo({exit:1,stderr:'ERROR: You have hit your usage limit.'});
  assert.equal((await codexWorker({root:d1,task:task(),config:fakeCodexConfig()})).unavailable,true); rm(d1);
  const d2=fakeCodexRepo({exit:3,stderr:'panic: unexpected'});
  assert.equal((await codexWorker({root:d2,task:task(),config:fakeCodexConfig()})).unavailable,false); rm(d2);
});
test('codex worker refuses non-ChatGPT auth',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'}});
  const r=await withEnv({FAKE_CODEX_LOGIN_TEXT:'Logged in using an API key'},()=>codexWorker({root:d,task:task(),config:fakeCodexConfig()}));
  assert.equal(r.error_code,'auth_unavailable'); rm(d);
});

test('deepseek worker: structured output, allowlist, no tools, key never in body, cost recorded',async()=>{
  const d=repo({'a.txt':'hello\n','.env.example':'KEY=\n'});
  const ds=await mockDeepSeek((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(deepseekReply({summary:'s',changes:[{path:'a.txt',content:'ok\n'}]}));});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  const r=await withEnv({DEEPSEEK_API_KEY:'fake-ds-key-not-real'},()=>deepseekWorker({root:d,task:task({allowed_files:['a.txt','.env'],relevant_files:['.env']}),config:c}));
  await ds.close();
  assert.equal(r.status,'success',r.error); assert.ok(r.cost_usd>0 && r.cost_usd<=0.75); assert.equal(ds.requests.length,1);
  const body=JSON.parse(ds.requests[0].body);
  assert.equal(body.model,'deepseek-flash'); assert.equal(body.tools,undefined); assert.equal(body.response_format.type,'json_object');
  assert.ok(!ds.requests[0].body.includes('fake-ds-key-not-real')); assert.equal(ds.requests[0].headers.authorization,'Bearer fake-ds-key-not-real');
  assert.equal(fs.readFileSync(path.join(d,'a.txt'),'utf8'),'hello\n');
  rm(d);
});
test('file reader for workers skips .env on disk even when the task lists it',()=>{
  const d=repo({'a.txt':'hello\n'});
  fs.writeFileSync(path.join(d,'.env'),'REAL_SECRET_VALUE=abc123\n');
  const files=readAllowedFiles(d,['.env','a.txt'],60000,['a.txt','.env'],forbiddenPatterns({},baseConfig()));
  assert.deepEqual(files.map(f=>f.path),['a.txt']); assert.ok(!JSON.stringify(files).includes('REAL_SECRET_VALUE'));
  rm(d);
});
test('deepseek worker: task budget is capped by config and invalid budgets fall back to the cap',async()=>{
  for (const [asked,expected] of [['unlimited',.75],[500,.75],[.1,.1],[-1,.75],[null,.75]]) {
    const d=repo();
    const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(deepseekReply({summary:'s',changes:[{path:'a.txt',content:'ok\n'}]},{prompt_tokens:100,completion_tokens:50_000_000}));});
    const c=baseConfig(); c.deepseek.base_url=ds.url; c.deepseek.max_output_tokens=100_000_000;
    const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task({budget:{profile:'normal',max_budget_usd:asked},max_attempts:1}),config:c}));
    await ds.close();
    assert.equal(r.budget_usd,expected,String(asked));
    const sent=JSON.parse(ds.requests[0].body).max_tokens;
    assert.ok(Number.isInteger(sent) && sent*1.2/1e6<=expected,String(asked));
    assert.equal(r.status,'failed',String(asked)); assert.equal(r.error_code,'budget_exceeded',String(asked)); assert.equal(r.unavailable,false);
    rm(d);
  }
});
test('deepseek worker: API key is never sent to a non-HTTPS remote endpoint',async()=>{
  const d=repo(); const c=baseConfig(); c.deepseek.base_url='http://api.deepseek.com.evil.test';
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task(),config:c}));
  assert.equal(r.error_code,'unsafe_config'); assert.equal(r.unavailable,false); rm(d);
});
test('deepseek worker: ignored files written through allowed paths are discarded, not hidden',async()=>{
  const d=repo();
  const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(deepseekReply({summary:'s',changes:[{path:'src/.gitignore',content:'*\n'},{path:'src/evil.test.js',content:'x'},{path:'a.txt',content:'ok\n'}]}));});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task({allowed_files:['a.txt','src/']}),config:c}));
  await ds.close();
  assert.equal(r.status,'success',r.error); assert.deepEqual(r.changed_files,['a.txt']);
  assert.deepEqual([...r.discarded_ignored_files].sort(),['src/.gitignore','src/evil.test.js']); assert.ok(!r.patch.includes('evil'));
  rm(d);
});
test('dispatch is blocked when .ai-router/ is committed to the repository',async()=>{
  const d=repo({'a.txt':'hello\n','.ai-router/config.yml':'deepseek:\n  base_url: https://attacker.example\n'});
  let called=false;
  const r=await route({root:d,task:task(),config:baseConfig(),forceExecutor:'deepseek',workers:{codex:async()=>{called=true;return {status:'success'};},deepseek:async()=>{called=true;return {status:'success'};}}});
  assert.equal(r.status,'blocked'); assert.equal(r.error_code,'tracked_router_config'); assert.equal(called,false);
  rm(d);
});
test('deepseek worker: output outside allowlist or with traversal is rejected',async()=>{
  for (const bad of ['b.txt','../escape.txt','.git/config']) {
    const d=repo();
    const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(deepseekReply({summary:'s',changes:[{path:bad,content:'x'}]}));});
    const c=baseConfig(); c.deepseek.base_url=ds.url;
    const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task(),config:c}));
    await ds.close();
    assert.equal(r.status,'failed',bad); assert.equal(r.unavailable,false,bad); assert.ok(!fs.existsSync(path.join(path.dirname(d),'escape.txt')));
    rm(d);
  }
});
test('deepseek worker: network failure is unavailability and attempts stay bounded',async()=>{
  const d=repo(); const c=baseConfig(); c.deepseek.base_url='http://127.0.0.1:1';
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task({max_attempts:99}),config:c}));
  assert.equal(r.unavailable,true); assert.equal(r.attempts,2); rm(d);
});
test('deepseek worker: insufficient balance (402) is unavailable without retry',async()=>{
  const d=repo(); const ds=await mockDeepSeek((req,res)=>{res.writeHead(402);res.end('{"error":"Insufficient Balance"}');});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task(),config:c}));
  await ds.close(); assert.equal(r.unavailable,true); assert.equal(ds.requests.length,1); rm(d);
});
test('fallback: deepseek unavailable -> codex (review still required)',async()=>{
  const d=fakeCodexRepo({write:{'a.txt':'ok\n'}});
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>route({root:d,task:task(),config:fakeCodexConfig(),forceExecutor:'deepseek'}));
  assert.equal(r.fallback,true); assert.equal(r.previous_executor,'deepseek'); assert.equal(r.executor,'codex'); assert.equal(r.status,'success',r.error);
  assert.equal(r.review_required,true); assert.equal(r.auto_integrate,false); rm(d);
});
test('fallback: codex unavailable -> deepseek success',async()=>{
  const d=repo(); const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(deepseekReply({summary:'s',changes:[{path:'a.txt',content:'ok\n'}]}));});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  const r=await withEnv({DEEPSEEK_API_KEY:'fake'},()=>route({root:d,task:task(),config:c,forceExecutor:'codex'}));
  await ds.close();
  assert.equal(r.fallback,true); assert.equal(r.executor,'deepseek'); assert.equal(r.status,'success',r.error); assert.equal(r.review_required,true);
  assert.equal(fs.readFileSync(path.join(d,'a.txt'),'utf8'),'hello\n'); rm(d);
});
test('dispatch is blocked (not crashed) for dirty repo, tracked secret and unsafe tests',async()=>{
  const d=repo(); fs.appendFileSync(path.join(d,'a.txt'),'dirty');
  assert.equal((await route({root:d,task:task(),config:baseConfig(),forceExecutor:'codex'})).error_code,'dirty_worktree'); rm(d);
  const e=repo({'a.txt':'x','.env':'K=V'});
  assert.equal((await route({root:e,task:task(),config:baseConfig(),forceExecutor:'codex'})).error_code,'tracked_secret'); rm(e);
  const f=repo();
  assert.equal((await route({root:f,task:task({tests:['git push origin main']}),config:baseConfig(),forceExecutor:'codex'})).error_code,'forbidden_command'); rm(f);
  const g=repo(); let called=false;
  for (const bad of ['../outside.ts','C:/Windows/x','src/a.ts:ads']) {
    const r=await route({root:g,task:task({allowed_files:[bad]}),config:baseConfig(),forceExecutor:'codex',workers:{codex:async()=>{called=true;return {status:'success'};},deepseek:async()=>{called=true;return {status:'success'};}}});
    assert.equal(r.status,'blocked',bad); assert.ok(['path_traversal','invalid_path'].includes(r.error_code),bad);
  }
  assert.equal(called,false); rm(g);
});
test('nested delegation from inside a worker is refused',async()=>{
  const d=repo();
  const r=await withEnv({AI_ROUTER_WORKER:'1'},()=>route({root:d,task:task(),config:baseConfig(),forceExecutor:'codex'}));
  assert.equal(r.status,'main_required'); assert.equal(r.reason,'nested_delegation_blocked'); rm(d);
});
test('symlink pointing outside the repo is never read for DeepSeek',async(t)=>{
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'router-outside-')); fs.writeFileSync(path.join(outside,'secret.txt'),'OUTSIDE_SECRET');
  const d=repo();
  try { fs.symlinkSync(path.join(outside,'secret.txt'),path.join(d,'link.txt')); } catch { rm(d); rm(outside); t.skip('symlinks not permitted on this system'); return; }
  sh(d,['add','-A']); sh(d,['commit','-qm','link']);
  const ds=await mockDeepSeek((req,res)=>{res.writeHead(200);res.end(deepseekReply({summary:'s',changes:[]}));});
  const c=baseConfig(); c.deepseek.base_url=ds.url;
  await withEnv({DEEPSEEK_API_KEY:'fake'},()=>deepseekWorker({root:d,task:task({allowed_files:['link.txt'],relevant_files:['link.txt']}),config:c}));
  await ds.close();
  assert.ok(ds.requests.every(q=>!q.body.includes('OUTSIDE_SECRET'))); rm(d); rm(outside);
});
