import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

export function sh(cwd,args){ return spawnSync('git',args,{cwd,encoding:'utf8'}); }
export function repo(files={'a.txt':'hello\n'}){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'router-test-'));
  sh(d,['init','-q']); sh(d,['config','user.email','test@example.com']); sh(d,['config','user.name','test']); sh(d,['config','core.autocrlf','false']);
  for (const [f,c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true}); fs.writeFileSync(path.join(d,f),c); }
  sh(d,['add','-A']); sh(d,['commit','-qm','init']); return d;
}
export function commitAll(d,msg='update'){ sh(d,['add','-A']); sh(d,['commit','-qm',msg]); }
export function rm(d){ try{ fs.rmSync(d,{recursive:true,force:true}); }catch{} }
export function baseConfig(){
  return {router:{small_task_direct:false},risk:{critical_score:8},
    execution:{require_clean_git_for_external_workers:true,keep_failed_worktree:false,run_tests_in_worktree:true,max_files:20,max_file_chars:60000,allowed_test_executables:['node','npm','git']},
    security:{forbidden_files:['.env','.env.*','**/.env','**/.env.*','**/*.pem','**/*.key','.git/**','**/.git/**']},
    codex:{command:'codex-command-that-does-not-exist',require_chatgpt_auth:true,timeout_ms:20000,sandbox:'workspace-write',disable_features:[]},
    deepseek:{base_url:'http://127.0.0.1:1',model:'deepseek-flash',max_attempts:2,timeout_ms:5000,max_output_tokens:1000,max_context_chars:10000,peak_cache_miss_input_usd_per_mtok:.3,peak_output_usd_per_mtok:1.2},
    budgets:{normal_max_usd:.75,default_profile:'normal'}};
}
// Fake Codex CLI: node runs `login` (auth check) and `exec` (the worker) as scripts from the cwd.
const FAKE_LOGIN=`console.log(process.env.FAKE_CODEX_LOGIN_TEXT||'Logged in using ChatGPT');\nprocess.exit(Number(process.env.FAKE_CODEX_LOGIN_EXIT||0));\n`;
// Writes a marker into the MAIN checkout and moves its current branch: what a hostile worker or test would try.
export const TAMPER_MAIN=`const cp=require('child_process'),fs=require('fs'),path=require('path');
const common=cp.spawnSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).stdout.trim();
const main=path.dirname(common);
fs.writeFileSync(path.join(main,'PWNED.txt'),'x');
const br=cp.spawnSync('git',['-C',main,'symbolic-ref','--short','HEAD'],{encoding:'utf8'}).stdout.trim();
const tree=cp.spawnSync('git',['write-tree'],{encoding:'utf8'}).stdout.trim();
const c=cp.spawnSync('git',['-c','user.email=w@x','-c','user.name=w','commit-tree',tree,'-m','hijack'],{encoding:'utf8'}).stdout.trim();
cp.spawnSync('git',['update-ref','refs/heads/'+br,c]);
`;
const FAKE_EXEC=`const fs=require('fs'),path=require('path');
const s=JSON.parse(fs.readFileSync('scenario.json','utf8'));
const out=process.argv[process.argv.indexOf('--output-last-message')+1];
if(s.dump_env_to) fs.writeFileSync(s.dump_env_to,JSON.stringify(Object.keys(process.env)));
if(s.tamper_main) require('./tamper-main.js');
if(s.echo_prompt) process.stderr.write('user\\n'+fs.readFileSync(0,'utf8')+'\\n');
for(const [f,c] of Object.entries(s.write||{})){ fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,c); }
if(s.link) fs.symlinkSync(s.link.target,s.link.path,'junction');
if(s.commit){ require('child_process').spawnSync('git',['-c','user.email=w@x','-c','user.name=w','commit','-qam','worker'],{stdio:'ignore'}); }
if(s.message) fs.writeFileSync(out,s.message);
if(s.stderr) process.stderr.write(s.stderr);
process.exit(s.exit||0);
`;
export function fakeCodexRepo(scenario,extra={}){
  return repo({'a.txt':'hello\n','login':FAKE_LOGIN,'exec':FAKE_EXEC,'tamper-main.js':TAMPER_MAIN,'scenario.json':JSON.stringify(scenario),
    'check.js':"const fs=require('fs');process.exit(fs.readFileSync('a.txt','utf8').includes('ok')?0:1);\n",...extra});
}
export function fakeCodexConfig(){ const c=baseConfig(); c.codex.command=process.execPath; return c; }
export async function mockDeepSeek(handler){
  const requests=[];
  const server=http.createServer((req,res)=>{ let body=''; req.on('data',d=>body+=d); req.on('end',()=>{ requests.push({headers:req.headers,body}); handler(req,res,body,requests.length); }); });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  return {url:`http://127.0.0.1:${server.address().port}`,requests,close:()=>new Promise(ok=>server.close(ok))};
}
export function deepseekReply(parsed,usage={prompt_tokens:100,completion_tokens:50}){
  return JSON.stringify({choices:[{message:{content:JSON.stringify(parsed)}}],usage});
}
export async function withEnv(vars,fn){
  const old={}; for(const k of Object.keys(vars)){ old[k]=process.env[k]; if(vars[k]===undefined) delete process.env[k]; else process.env[k]=vars[k]; }
  try{ return await fn(); } finally { for(const k of Object.keys(vars)){ if(old[k]===undefined) delete process.env[k]; else process.env[k]=old[k]; } }
}
