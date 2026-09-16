#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { ensureSafeRepo } from '../lib/security.mjs';
const args=process.argv.slice(2); const i=args.indexOf('--root'); const root=path.resolve(i>=0?args[i+1]:'.');
function v(cmd,a=['--version']){const r=spawnSync(cmd,a,{encoding:'utf8',windowsHide:true});return r.status===0?(r.stdout||r.stderr).trim().split('\n')[0]:null;}
function present(name){ if(process.env[name]) return true; if(process.platform!=='win32') return false;
  // A variable set in the Windows user/machine scope after this shell started is still "configured"; only presence is checked.
  for(const scope of ['HKCU\\Environment','HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']){ const r=spawnSync('reg',['query',scope,'/v',name],{stdio:'ignore',windowsHide:true}); if(r.status===0) return true; } return false; }
let repo;try{repo=ensureSafeRepo(root,{requireClean:false});}catch(e){repo={error:e.code||'not_git'};}
const login=spawnSync('codex',['login','status'],{encoding:'utf8',windowsHide:true});
const loginText=`${login.stdout||''}\n${login.stderr||''}`;
const codexAuth=login.error?'codex_not_found':(login.status===0 && /logged in using chatgpt/i.test(loginText))?'chatgpt':/api key/i.test(loginText)?'api_key':/not logged in/i.test(loginText)?'not_logged_in':'unknown';
let installed={};
try{ installed=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.claude','plugins','installed_plugins.json'),'utf8')).plugins||{}; }catch{}
const nodeMajor=Number(process.versions.node.split('.')[0]);
const deepseek=present('DEEPSEEK_API_KEY');
const blockers=[];
if(nodeMajor<20) blockers.push('node_below_20');
if(repo.error) blockers.push(['tracked_secret','tracked_router_config'].includes(repo.error)?repo.error:'not_a_git_repo');
else if(repo.dirty) blockers.push('dirty_worktree');
if(codexAuth!=='chatgpt' && !deepseek) blockers.push('no_external_worker_configured');
console.log(JSON.stringify({
  node:process.version,node_20_plus:nodeMajor>=20,git:v('git'),claude:v('claude'),codex:v('codex'),
  codex_auth:codexAuth,codex_chatgpt:codexAuth==='chatgpt',deepseek_key_present:deepseek,
  anthropic_base_url_overridden:Boolean(process.env.ANTHROPIC_BASE_URL),
  git_repo:!repo.error,git_dirty:Boolean(repo.dirty),tracked_secret:repo.error==='tracked_secret',tracked_router_config:repo.error==='tracked_router_config',
  router_initialized:fs.existsSync(path.join(root,'.ai-router','config.yml')),
  external_worker_ready:blockers.length===0,external_worker_blockers:blockers,
  optional_integrations:{saas_audit_br:Object.keys(installed).some(k=>k.startsWith('saas-audit-br@'))},
  note:'Secret values are never printed.'
},null,2));
