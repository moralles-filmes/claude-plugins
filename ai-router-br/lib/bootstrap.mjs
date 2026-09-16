import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { syncProjectRules } from './rules.mjs';
import { trackedRouterPath } from './security.mjs';

const STATE_TEMPLATE='# AI Router State\n\nKeep this short. No secrets.\n\n- Active task: none\n- Last result: none\n';
const REPORT_TEMPLATE='# AI Router Report\n\n';

function gitRun(root,args){ return spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}); }
function gitOut(root,args){
  const r=gitRun(root,args);
  return r.status===0?r.stdout.trim():null;
}
export function resolveProjectRoot(root) {
  const abs=path.resolve(root||'.');
  const top=gitOut(abs,['rev-parse','--show-toplevel']);
  return top?path.resolve(top):abs;
}
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const within=(parent,child)=>{ const rel=path.relative(path.resolve(parent).toLowerCase(),path.resolve(child).toLowerCase()); return rel==='' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
function unsafeRoot(root,home) {
  const r=path.resolve(root);
  if (same(r,home) || same(r,path.parse(r).root)) return 'home_or_filesystem_root';
  // Agent configuration folders hold global CLAUDE.md/AGENTS.md: never treat them as projects.
  if (within(path.join(home,'.claude'),r) || within(path.join(home,'.codex'),r)) return 'agent_config_dir';
  if (!fs.existsSync(r) || !fs.statSync(r).isDirectory()) return 'not_a_directory';
  // Workers need git, and outside a repository the rule files would land in arbitrary folders.
  if (gitOut(r,['rev-parse','--is-inside-work-tree'])!=='true') return 'not_git_repo';
  // A committed .ai-router/ (any letter case) came with the repository: do not write into it or trust it.
  const tracked=gitRun(r,['ls-files','-z']);
  if (tracked.status===0 && trackedRouterPath(tracked.stdout.split('\0').filter(Boolean))) return 'tracked_router_dir';
  return null;
}
function ensureGitExclude(root) {
  const rel=gitOut(root,['rev-parse','--git-path','info/exclude']);
  if (!rel) return 'not_git';
  const file=path.resolve(root,rel);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if (current.split(/\r?\n/).some(l=>l.trim()==='.ai-router/' || l.trim()==='/.ai-router/')) return 'present';
  fs.appendFileSync(file,(current && !current.endsWith('\n')?'\n':'')+'.ai-router/\n');
  return 'added';
}

/**
 * Idempotent project bootstrap. Creates only local, reversible router infrastructure:
 * .ai-router/{TASKS,RESULTS,config.yml,STATE.md,REPORT.md}, a local .git/info/exclude rule,
 * and the short rule block in CLAUDE.md/AGENTS.md (only when the project is first initialized).
 */
export function ensureInitialized(rootInput,pluginRoot,{syncRules='on-create',env=process.env,home=os.homedir()}={}) {
  const root=resolveProjectRoot(rootInput);
  if (env.AI_ROUTER_WORKER==='1') return {root,status:'skipped',reason:'inside_worker'};
  const unsafe=unsafeRoot(root,home);
  if (unsafe) return {root,status:'skipped',reason:unsafe};
  const base=path.join(root,'.ai-router');
  const config=path.join(base,'config.yml');
  const firstRun=!fs.existsSync(config);
  const created=[];
  // Exclude first, so router files never show up as untracked changes.
  const gitExclude=ensureGitExclude(root);
  for (const d of ['TASKS','RESULTS']) { const p=path.join(base,d); if(!fs.existsSync(p)){ fs.mkdirSync(p,{recursive:true}); created.push(`.ai-router/${d}/`); } }
  if (!fs.existsSync(config)) { fs.copyFileSync(path.join(pluginRoot,'templates','config.yml'),config); created.push('.ai-router/config.yml'); }
  for (const [name,content] of [['STATE.md',STATE_TEMPLATE],['REPORT.md',REPORT_TEMPLATE]]) {
    const p=path.join(base,name); if(!fs.existsSync(p)){ fs.writeFileSync(p,content); created.push(`.ai-router/${name}`); }
  }
  let rules=null;
  if (syncRules==='always' || (syncRules==='on-create' && firstRun)) {
    rules=syncProjectRules(root,{apply:true});
  }
  return {root,status:firstRun?'created':'existing',created,git_exclude:gitExclude,rules_synced:rules?rules.results.filter(r=>r.changed).map(r=>path.basename(r.file)):[]};
}
