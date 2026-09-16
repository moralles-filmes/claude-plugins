import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { ensureSafeRepo } from '../lib/security.mjs';
import { codexWorker } from '../workers/codex-worker.mjs';
import { deepseekWorker } from '../workers/deepseek-worker.mjs';
import { route } from '../lib/router.mjs';

function repo(){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'router-test-'));
  spawnSync('git',['init','-q'],{cwd:d}); spawnSync('git',['config','user.email','test@example.com'],{cwd:d}); spawnSync('git',['config','user.name','test'],{cwd:d});
  fs.writeFileSync(path.join(d,'a.txt'),'hello\n'); spawnSync('git',['add','.'],{cwd:d}); spawnSync('git',['commit','-qm','init'],{cwd:d}); return d;
}
function cfg(){return {router:{small_task_direct:false},risk:{critical_score:8},execution:{require_clean_git_for_external_workers:true,keep_failed_worktree:false,max_files:20,max_file_chars:60000,allowed_test_executables:['node','npm','git']},security:{forbidden_files:['.env','.env.*','**/.env','**/.env.*','**/*.pem','**/*.key','**/.git/**']},codex:{command:'codex-command-that-does-not-exist',require_chatgpt_auth:true,timeout_ms:1000,sandbox:'workspace-write',disable_features:[]},deepseek:{base_url:'http://127.0.0.1:1',model:'deepseek-flash',max_attempts:2,timeout_ms:1000,max_output_tokens:1000,max_context_chars:10000,peak_cache_miss_input_usd_per_mtok:.3,peak_output_usd_per_mtok:1.2},budgets:{normal_max_usd:.75,default_profile:'normal'}};}
const task={id:'TASK-T',objective:'Implementar feature',allowed_files:['a.txt'],relevant_files:['a.txt'],tests:[],budget:{profile:'normal'},max_attempts:2};

test('clean repo passes preflight',()=>{const d=repo();assert.equal(ensureSafeRepo(d).dirty,false);fs.rmSync(d,{recursive:true,force:true});});
test('dirty repo blocks external worker',()=>{const d=repo();fs.appendFileSync(path.join(d,'a.txt'),'x');assert.throws(()=>ensureSafeRepo(d),/dirty_worktree/);fs.rmSync(d,{recursive:true,force:true});});
test('tracked .env blocks external worker',()=>{const d=repo();fs.writeFileSync(path.join(d,'.env'),'SECRET=x');spawnSync('git',['add','.env'],{cwd:d});spawnSync('git',['commit','-qm','env'],{cwd:d});assert.throws(()=>ensureSafeRepo(d),/tracked_secret/);fs.rmSync(d,{recursive:true,force:true});});
test('tracked .env.example is allowed documentation',()=>{const d=repo();fs.writeFileSync(path.join(d,'.env.example'),'KEY=');spawnSync('git',['add','.env.example'],{cwd:d});spawnSync('git',['commit','-qm','example'],{cwd:d});assert.equal(ensureSafeRepo(d).dirty,false);fs.rmSync(d,{recursive:true,force:true});});
test('codex unavailable is detected',async()=>{const d=repo();const r=await codexWorker({root:d,task,config:cfg()});assert.equal(r.status,'failed');assert.equal(r.unavailable,true);fs.rmSync(d,{recursive:true,force:true});});
test('deepseek missing key is unavailable without leaking secret',async()=>{const d=repo();const old=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;const r=await deepseekWorker({root:d,task,config:cfg()});if(old!==undefined)process.env.DEEPSEEK_API_KEY=old;assert.equal(r.status,'failed');assert.equal(r.unavailable,true);assert.ok(!String(r.error).includes('Bearer'));fs.rmSync(d,{recursive:true,force:true});});
test('critical manual force cannot bypass main',async()=>{const c=cfg();const r=await route({root:repo(),task:{...task,objective:'Alterar autenticação e RLS em produção'},config:c,dryRun:true,forceExecutor:'deepseek'});assert.equal(r.tier,0);assert.equal(r.executor,'main');});
test('fallback is attempted only for unavailable primary',async()=>{const d=repo();const c=cfg();const old=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;const r=await route({root:d,task,config:c,dryRun:false,forceExecutor:'codex'});if(old!==undefined)process.env.DEEPSEEK_API_KEY=old;assert.equal(r.fallback,true);assert.equal(r.previous_executor,'codex');assert.equal(r.executor,'deepseek');fs.rmSync(d,{recursive:true,force:true});});
test('deepseek max attempts is bounded on transient API errors',async()=>{
  const d=repo(); let hits=0; const server=http.createServer((req,res)=>{hits++;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"temporary"}');}); await new Promise(ok=>server.listen(0,'127.0.0.1',ok)); const port=server.address().port;
  const c=cfg();c.deepseek.base_url=`http://127.0.0.1:${port}`;c.deepseek.max_attempts=2;const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY=['test','not','secret'].join('-'); const r=await deepseekWorker({root:d,task,config:c}); if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old; await new Promise(ok=>server.close(ok)); assert.equal(r.attempts,2);assert.equal(hits,2);fs.rmSync(d,{recursive:true,force:true});
});
test('deepseek hard budget can stop before network call',async()=>{
  const d=repo();let hits=0;const server=http.createServer((req,res)=>{hits++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;
  const c=cfg();c.deepseek.base_url=`http://127.0.0.1:${port}`;const tiny={...task,budget:{profile:'normal',max_budget_usd:0.000000001}};const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY=['test','not','secret'].join('-');const r=await deepseekWorker({root:d,task:tiny,config:c});if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;await new Promise(ok=>server.close(ok));assert.equal(r.status,'failed');assert.match(r.error,/budget/);assert.equal(hits,0);fs.rmSync(d,{recursive:true,force:true});
});
