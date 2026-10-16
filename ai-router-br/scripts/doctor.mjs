#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { ensureSafeRepo } from '../lib/security.mjs';
import { loadConfig } from '../lib/config.mjs';
import { COMPLEXITIES, ladderFor, probeEnvironment, resolveCandidate, unavailableReason } from '../lib/models.mjs';
const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2); const i=args.indexOf('--root'); const root=path.resolve(i>=0?args[i+1]:'.');
function v(cmd,a=['--version']){const r=spawnSync(cmd,a,{encoding:'utf8',windowsHide:true});return r.status===0?(r.stdout||r.stderr).trim().split('\n')[0]:null;}
function present(name){ if(process.env[name]) return true; if(process.platform!=='win32') return false;
  // A variable set in the Windows user/machine scope after this shell started is still "configured"; only presence is checked.
  for(const scope of ['HKCU\\Environment','HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']){ const r=spawnSync('reg',['query',scope,'/v',name],{stdio:'ignore',windowsHide:true}); if(r.status===0) return true; } return false; }
let repo;try{repo=ensureSafeRepo(root,{requireClean:false});}catch(e){repo={error:e.code||'not_git'};}
let config; try{ config=loadConfig(root,pluginRoot); }catch{ config=loadConfig(os.tmpdir(),pluginRoot); }
const probe=probeEnvironment({config});
const [codexBin,...codexPre]=probe.codex_command||[];
const login=codexBin?spawnSync(codexBin,[...codexPre,'login','status'],{encoding:'utf8',windowsHide:true}):{error:true};
const loginText=`${login.stdout||''}\n${login.stderr||''}`;
const codexAuth=login.error?'codex_not_found':(login.status===0 && /logged in using chatgpt/i.test(loginText))?'chatgpt':/api key/i.test(loginText)?'api_key':/not logged in/i.test(loginText)?'not_logged_in':'unknown';
let installed={};
try{ installed=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.claude','plugins','installed_plugins.json'),'utf8')).plugins||{}; }catch{}
const nodeMajor=Number(process.versions.node.split('.')[0]);
// The router reads the key from its own process: a key set in Windows after the editor started needs a restart.
const deepseekKey=probe.deepseek_key==='missing' && present('DEEPSEEK_API_KEY')?'set_in_windows_restart_required':probe.deepseek_key;
const blockers=[];
if(nodeMajor<20) blockers.push('node_below_20');
if(repo.error) blockers.push(['tracked_secret','tracked_router_config'].includes(repo.error)?repo.error:'not_a_git_repo');
else if(repo.dirty) blockers.push('dirty_worktree');
if(codexAuth!=='chatgpt' && probe.deepseek_key!=='ok') blockers.push('no_external_worker_configured');
if(probe.deepseek_key==='malformed') blockers.push('deepseek_key_malformed');
// What each complexity would run on this machine right now, first available rung first.
const routing=Object.fromEntries(COMPLEXITIES.map(k=>[k,ladderFor(config,k).map(c=>resolveCandidate(c,probe)).map(c=>{
  const why=unavailableReason(c,probe) ?? (c.executor==='codex' && codexAuth!=='chatgpt'?`codex_auth_${codexAuth}`:null);
  return `${[c.executor,c.model,c.effort].filter(Boolean).join(':')}${why?` (indisponível: ${why})`:''}`;
})]));
console.log(JSON.stringify({
  node:process.version,node_20_plus:nodeMajor>=20,git:v('git'),claude:v('claude'),codex:codexBin?v(codexBin,[...codexPre,'--version']):null,
  codex_command:codexBin||null,codex_auth:codexAuth,codex_chatgpt:codexAuth==='chatgpt',
  codex_models:probe.codex_models?[...probe.codex_models.models.keys()]:null,codex_models_fetched_at:probe.codex_models?.fetched_at??null,
  deepseek_key_present:deepseekKey!=='missing',deepseek_key_format:deepseekKey,
  host:probe.host,claude_subagents:probe.host==='claude',
  anthropic_base_url_overridden:Boolean(process.env.ANTHROPIC_BASE_URL),
  git_repo:!repo.error,git_dirty:Boolean(repo.dirty),tracked_secret:repo.error==='tracked_secret',tracked_router_config:repo.error==='tracked_router_config',
  router_initialized:fs.existsSync(path.join(root,'.ai-router','config.yml')),
  external_worker_ready:blockers.length===0,external_worker_blockers:blockers,
  routing,
  optional_integrations:{saas_audit_br:Object.keys(installed).some(k=>k.startsWith('saas-audit-br@'))},
  note:'Secret values are never printed.'
},null,2));
