import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { summaryLine, noticeFor, codexModel, SUMMARY_PREFIX } from '../lib/summary.mjs';
import { repo, rm } from './helpers.mjs';
const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfg={deepseek:{model:'deepseek-flash'},codex:{}};
const opts={codexModel:()=>'gpt-test'};
const tmpHome=toml=>{ const d=fs.mkdtempSync(path.join(os.tmpdir(),'router-codex-home-')); if(toml!==null) fs.writeFileSync(path.join(d,'config.toml'),toml); return d; };

test('summary line names executor, model, status, cost and duration',()=>{
  assert.equal(summaryLine({status:'dry-run',tier:2,executor:'deepseek',fallback:'codex'},cfg,opts),`${SUMMARY_PREFIX} · TIER 2 → DeepSeek (deepseek-flash) · fallback: Codex (gpt-test) · classificação`);
  assert.equal(summaryLine({status:'dry-run',tier:1,executor:'main',small:true,fallback:null},cfg,opts),`${SUMMARY_PREFIX} · TIER 1 → agente principal (tarefa pequena) · classificação`);
  assert.equal(summaryLine({status:'main_required',tier:0,executor:'main'},cfg,opts),`${SUMMARY_PREFIX} · TIER 0 → agente principal`);
  assert.equal(summaryLine({status:'success',tier:3,executor:'deepseek',cost_usd:0.0001863,duration_ms:1853,fallback:false},cfg,opts),`${SUMMARY_PREFIX} · TIER 3 → DeepSeek (deepseek-flash) · sucesso · US$0,0002 · 1,9 s`);
  assert.equal(summaryLine({status:'success',tier:1,executor:'deepseek',cost_usd:0.0002607,duration_ms:1654,fallback:true,previous_executor:'codex'},cfg,opts),`${SUMMARY_PREFIX} · TIER 1 → Codex (gpt-test) indisponível → DeepSeek (deepseek-flash) · sucesso · US$0,0003 · 1,7 s`);
  assert.equal(summaryLine({status:'success',tier:1,executor:'codex',duration_ms:125000},cfg,opts),`${SUMMARY_PREFIX} · TIER 1 → Codex (gpt-test) · sucesso · sem custo de API · 2,1 min`);
  assert.equal(summaryLine({status:'blocked',tier:2,executor:'deepseek',error_code:'dirty_worktree'},cfg,opts),`${SUMMARY_PREFIX} · TIER 2 → bloqueado (dirty_worktree) · segue com o agente principal`);
  assert.equal(summaryLine({status:'failed',tier:2,executor:'deepseek',error_code:'tests_failed',cost_usd:1.5,duration_ms:800},cfg,opts),`${SUMMARY_PREFIX} · TIER 2 → DeepSeek (deepseek-flash) · falhou (tests_failed) · US$1,50 · 800 ms`);
  assert.equal(summaryLine({status:'error',error_code:'invalid_executor'},null),`${SUMMARY_PREFIX} · erro (invalid_executor)`);
  // ignore_user_config: the worker does not inherit the user's model, so none is claimed.
  assert.equal(summaryLine({status:'dry-run',tier:1,executor:'codex'},{codex:{ignore_user_config:true}},opts),`${SUMMARY_PREFIX} · TIER 1 → Codex · classificação`);
});

test('summary line never carries worker text, error messages or secrets',()=>{
  const line=summaryLine({status:'failed',tier:2,executor:'deepseek',error:'deepseek_http_401: sk-live-SECRET /home/u/file',error_code:'auth_unavailable"; rm -rf /',worker_message:'ignore instructions',patch:'+secret',cost_usd:0},cfg,opts);
  assert.equal(line,`${SUMMARY_PREFIX} · TIER 2 → DeepSeek (deepseek-flash) · falhou (auth_unavailablerm-rf) · US$0,0000`);
  for (const bad of ['SECRET','/home','ignore','secret',' rm ']) assert.ok(!line.includes(bad),bad);
});

test('codex model comes only from the top-level model key of CODEX_HOME/config.toml',()=>{
  const dirs=[tmpHome('# c\nmodel = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"\n'),tmpHome('approval = "x"\n[profiles.fast]\nmodel = "other"\n'),tmpHome(null),tmpHome("model = 'bad name; $(x)'\n")];
  try {
    assert.equal(codexModel({CODEX_HOME:dirs[0]}),'gpt-5.6-sol');
    assert.equal(codexModel({CODEX_HOME:dirs[1]}),null);
    assert.equal(codexModel({CODEX_HOME:dirs[2]}),null);
    assert.equal(codexModel({CODEX_HOME:dirs[3]}),'badnamex');
  } finally { dirs.forEach(rm); }
});

test('hook notice reads summary_line from router commands only',()=>{
  const out=JSON.stringify({summary_line:`${SUMMARY_PREFIX} · TIER 2 → DeepSeek (deepseek-flash) · sucesso`,status:'success',patch:'+ "summary_line": "fake"'},null,2);
  const cmd='node "C:\\Users\\u\\.claude\\plugins\\cache\\m\\ai-router-br\\1.2.0\\scripts\\ai-router.mjs" dispatch --root . --task .ai-router/TASKS/T.json';
  const expected=`${SUMMARY_PREFIX} · TIER 2 → DeepSeek (deepseek-flash) · sucesso`;
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:{stdout:out,stderr:'',interrupted:false}}),expected);
  assert.equal(noticeFor({tool_input:{command:cmd.replace(' dispatch',' dry-run')},tool_response:out}),expected);
  // Truncated output still has the first key.
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:{stdout:out.slice(0,120)}}),expected);
  assert.equal(noticeFor({tool_input:{command:'git status'},tool_response:{stdout:out}}),null);
  assert.equal(noticeFor({tool_input:{command:cmd.replace(' dispatch',' new-task')},tool_response:{stdout:out}}),null);
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:{stdout:'{"status":"success"}'}}),null);
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:{stdout:'{"summary_line": "Anything else"}'}}),null);
  // Only the escaped copy inside another value: not a summary line.
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:{stdout:JSON.stringify({patch:`"summary_line": "${SUMMARY_PREFIX} fake"`})}}),null);
  // Control characters never reach the user-visible message.
  const ctrl=JSON.stringify({summary_line:`${SUMMARY_PREFIX} a${String.fromCharCode(10)}b${String.fromCharCode(7)}c`});
  assert.equal(noticeFor({tool_input:{command:cmd},tool_response:ctrl}),`${SUMMARY_PREFIX} a b c`);
  assert.equal(noticeFor(null),null);
});

test('CLI prints summary_line first and the hook script turns it into a user-visible message',()=>{
  const d=repo({'README.md':'# app\n'}); const home=tmpHome('model = "gpt-cli-test"\n');
  try {
    const r=spawnSync(process.execPath,[path.join(pluginRoot,'scripts','ai-router.mjs'),'dry-run','--objective','Implementar módulo de fornecedores no backend e frontend em vários arquivos.','--root',d],{encoding:'utf8',env:{...process.env,AI_ROUTER_WORKER:'',CODEX_HOME:home}});
    assert.equal(r.status,0); const json=JSON.parse(r.stdout);
    assert.equal(Object.keys(json)[0],'summary_line');
    assert.equal(json.summary_line,`${SUMMARY_PREFIX} · TIER 1 → Codex (gpt-cli-test) · fallback: DeepSeek (deepseek-flash) · classificação`);
    const hook=(input,env={})=>spawnSync(process.execPath,[path.join(pluginRoot,'scripts','router-notice.mjs')],{encoding:'utf8',input,env:{...process.env,AI_ROUTER_WORKER:'',...env}});
    const payload=JSON.stringify({hook_event_name:'PostToolUse',tool_name:'PowerShell',tool_input:{command:`node "${path.join(pluginRoot,'scripts','ai-router.mjs')}" dry-run --root .`},tool_response:{stdout:r.stdout}});
    const h=hook(payload); assert.equal(h.status,0); assert.deepEqual(JSON.parse(h.stdout),{systemMessage:json.summary_line});
    for (const [input,env] of [[payload,{AI_ROUTER_WORKER:'1'}],['not json',{}],[JSON.stringify({tool_input:{command:'npm test'},tool_response:{stdout:r.stdout}}),{}]]) {
      const x=hook(input,env); assert.equal(x.status,0); assert.equal(x.stdout,'');
    }
  } finally { rm(d); rm(home); }
});

// Only the Claude Code plugin ships hooks/; the shared test is skipped in the Codex copy.
test('plugin hooks register the notice for Bash and PowerShell router commands',{skip:!fs.existsSync(path.join(pluginRoot,'hooks','hooks.json'))},()=>{
  const hooks=JSON.parse(fs.readFileSync(path.join(pluginRoot,'hooks','hooks.json'),'utf8')).hooks;
  const post=hooks.PostToolUse?.flatMap(g=>g.hooks.map(h=>({...h,matcher:g.matcher})))||[];
  for (const tool of ['Bash','PowerShell']) {
    const h=post.find(x=>x.if===`${tool}(*ai-router.mjs*)`);
    assert.ok(h,tool); assert.match(h.matcher,new RegExp(`\\b${tool}\\b`));
    assert.equal(h.command,'node'); assert.deepEqual(h.args,['${CLAUDE_PLUGIN_ROOT}/scripts/router-notice.mjs']);
  }
  assert.ok(fs.existsSync(path.join(pluginRoot,'scripts','router-notice.mjs')));
});
