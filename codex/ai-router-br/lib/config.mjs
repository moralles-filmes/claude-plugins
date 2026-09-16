import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './simple-yaml.mjs';
import { trackedFiles, trackedRouterPath } from './security.mjs';

export function pluginRootFrom(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)),'..');
}

const isObj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const positive=v=>{ if(typeof v==='boolean' || v===null || v==='') return null; const n=Number(v); return Number.isFinite(n) && n>0?n:null; };
const SANDBOX_RANK={'read-only':0,'workspace-write':1};
const PROFILE_RANK={cheap:0,normal:1,large:2};
const lower=rank=>(t,p)=>(p in rank && t in rank && rank[p]<rank[t])?p:t;
function merge(base,over) {
  const out={...base};
  for (const [k,v] of Object.entries(over||{})) out[k]=isObj(v)&&isObj(base?.[k])?merge(base[k],v):v;
  return out;
}

/**
 * The project file is local but not fully trusted (it can be copied from elsewhere). It may tighten security
 * settings, never loosen them: endpoints, commands and auth stay as shipped by the plugin; budgets, limits and
 * attempts can only go down; prices only up; allowlists only shrink; denylists only grow.
 */
export function hardenConfig(template,project) {
  const ignored=[];
  const cfg=merge(template,isObj(project)?project:{});
  const section=name=>{ if(!isObj(cfg[name])) cfg[name]={}; return cfg[name]; };
  const tplOf=name=>isObj(template[name])?template[name]:{};
  const lock=(name,key)=>{ const s=section(name); const t=tplOf(name)[key]; if(JSON.stringify(s[key])!==JSON.stringify(t)) ignored.push(`${name}.${key}`); if(t===undefined) delete s[key]; else s[key]=t; };
  const pick=(name,key,choose)=>{ const s=section(name); const t=tplOf(name)[key]; const p=s[key]; const v=choose(t,p); if(p!==undefined && JSON.stringify(v)!==JSON.stringify(p)) ignored.push(`${name}.${key}`); if(v===undefined) delete s[key]; else s[key]=v; };
  // Unions keep every project entry, so they never report an ignored setting.
  const union=(name,key)=>{ const s=section(name); const t=tplOf(name)[key]; s[key]=[...new Set([...(Array.isArray(t)?t:[]),...(Array.isArray(s[key])?s[key]:[])].map(String))]; };
  const atMost=(t,p)=>{ const tn=positive(t); const pn=positive(p); return tn==null?(pn??t):(pn==null?tn:Math.min(tn,pn)); };
  const atLeast=(t,p)=>{ const tn=positive(t); const pn=positive(p); return tn==null?(pn??t):(pn==null?tn:Math.max(tn,pn)); };
  const validNumber=(t,p)=>positive(p)??t;
  const stayTrue=(t,p)=>t===true?true:(typeof p==='boolean'?p:t);
  const onlyOff=(t,p)=>t===true && p!==false;

  for (const key of ['command','require_chatgpt_auth']) lock('codex',key);
  for (const key of ['base_url','model']) lock('deepseek',key);
  pick('codex','sandbox',lower(SANDBOX_RANK));
  union('codex','disable_features');
  pick('codex','ignore_user_config',(t,p)=>typeof p==='boolean'?p:t);
  for (const key of ['max_attempts','max_output_tokens','max_context_chars']) pick('deepseek',key,atMost);
  for (const key of ['peak_cache_miss_input_usd_per_mtok','peak_output_usd_per_mtok']) pick('deepseek',key,atLeast);
  pick('deepseek','timeout_ms',validNumber); pick('codex','timeout_ms',validNumber);
  pick('execution','require_clean_git_for_external_workers',stayTrue);
  pick('execution','run_tests_in_worktree',onlyOff);
  pick('execution','keep_failed_worktree',(t,p)=>typeof p==='boolean'?p:t);
  for (const key of ['max_files','max_file_chars']) pick('execution',key,atMost);
  pick('execution','test_timeout_ms',validNumber);
  pick('execution','allowed_test_executables',(t,p)=>{ const tl=(Array.isArray(t)?t:[]).map(String); return Array.isArray(p)?tl.filter(x=>p.map(y=>String(y).toLowerCase()).includes(x.toLowerCase())):tl; });
  union('security','forbidden_files');
  for (const key of Object.keys(tplOf('budgets')).filter(k=>k.endsWith('_max_usd'))) pick('budgets',key,atMost);
  pick('budgets','default_profile',lower(PROFILE_RANK));
  pick('risk','critical_score',atMost);
  return {config:cfg,ignored:[...new Set(ignored)]};
}

function routerDirTracked(root) {
  let tracked=[];
  try { tracked=trackedFiles(root); } catch { return false; }
  return !!trackedRouterPath(tracked);
}
export function loadConfig(projectRoot, pluginRoot) {
  const template=parseYaml(fs.readFileSync(path.join(pluginRoot,'templates','config.yml'),'utf8'));
  const local=path.join(projectRoot,'.ai-router','config.yml');
  let project={}; const notes=[];
  if (fs.existsSync(local)) {
    // A committed .ai-router/ (any letter case) came with the repository, not from this machine: ignore its config entirely.
    if (routerDirTracked(projectRoot)) notes.push('.ai-router/config.yml (rastreado pelo git: ignorado)');
    else project=parseYaml(fs.readFileSync(local,'utf8'));
  }
  const {config,ignored}=hardenConfig(template,project);
  Object.defineProperty(config,'ignored_project_settings',{value:[...notes,...ignored],enumerable:false});
  return config;
}
export function get(obj, dotted, fallback) {
  let cur=obj; for (const p of dotted.split('.')) { if (cur==null || !(p in cur)) return fallback; cur=cur[p]; }
  return cur;
}
