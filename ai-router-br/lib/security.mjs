import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripRules, extractAllRules, RULES_BLOCK, RULE_FILES } from './rules.mjs';

export const DEFAULT_FORBIDDEN=['.env','.env.*','**/.env','**/.env.*','**/*.pem','**/*.key','**/*.p12','**/*.pfx','**/credentials.json','**/secrets.*','.git/**','**/.git/**'];
export const DEFAULT_TEST_EXECUTABLES=['node','npm','pnpm','yarn','bun','git','tsc','vitest','jest'];
const SAFE_ENV_DOC=/\.env(?:\.[^/]+)*\.(example|sample|template)$/i;
const SAFE_TRACKED_DOC=/(^|\/)[^/]*\.(example|sample|template)(\.[A-Za-z0-9]+)?$/i;
// Secret-bearing data files. Source code such as secrets.ts is not data and does not block delegation.
const SECRET_TRACKED=/(^|\/)(\.env($|\.)|credentials\.json$|secrets?\.(json|ya?ml|toml|ini|env|txt|properties|conf)$|[^/]*\.(pem|p12|pfx|key)$)/i;
const META=/[;&|`$<>\n\r]/;
const GIT_READONLY=new Set(['diff','status','log','show','ls-files','rev-parse','grep','blame','describe']);
// Read-only git subcommands can still write files or spawn programs through these options.
const GIT_UNSAFE_LONG=['output','open-files-in-pager','ext-diff','textconv','exec','config-env','upload-pack','receive-pack'];
// Real options that happen to be prefixes of an unsafe one (git prefers the exact match).
const GIT_SAFE_LONG=new Set(['text']);
const PKG_MANAGERS=new Set(['npm','pnpm','yarn','bun']);
const PKG_RUNNERS=new Set(['npx','pnpx','bunx']);
const PKG_FORBIDDEN=new Set(['publish','unpublish','deprecate','owner','access','login','logout','adduser','token','dist-tag']);
const PKG_RUN=new Set(['test','t','run','run-script']);
const PKG_SAFE_FLAG=new Set(['--silent','-s','--if-present']);
// Reporters are imported as modules, so only the built-in ones are accepted, writing to stdout/stderr.
const NODE_SAFE_FLAG=/^--(test|test-only|experimental-test-coverage|experimental-vm-modules|enable-source-maps|no-warnings|trace-warnings|test-reporter=(spec|tap|dot|junit|lcov)|test-reporter-destination=(stdout|stderr)|test-name-pattern=.+|test-skip-pattern=.+|test-concurrency=\d+|test-timeout=\d+|max-old-space-size=\d+)$/;

function fail(message,code){ return Object.assign(new Error(message),{code}); }
function gitArgUnsafe(arg) {
  if(arg.startsWith('--')) {
    const name=arg.slice(2).split('=')[0].toLowerCase();
    // Git accepts unambiguous abbreviations (--open-files-in-pag=), so any prefix of an unsafe option is rejected.
    return !!name && !GIT_SAFE_LONG.has(name) && GIT_UNSAFE_LONG.some(u=>u.startsWith(name) || name.startsWith(u));
  }
  // Short options bundle (-iO<pager>): an O anywhere in the token may be --open-files-in-pager.
  return arg==='-c' || (arg.startsWith('-') && arg.slice(1).includes('O'));
}

export function normalizeRelative(p) {
  if (typeof p!=='string' || !p.trim()) throw fail('invalid_path','invalid_path');
  const q=p.replaceAll('\\','/').replace(/^\.\//,'');
  if (q.startsWith('/') || /^[A-Za-z]:/.test(q) || q.split('/').includes('..')) throw fail('path_traversal','path_traversal');
  // ':' covers NTFS alternate data streams; control chars and Windows-reserved characters are never valid task paths.
  if (/[\u0000-\u001f:*?"<>|]/.test(q)) throw fail('invalid_path','invalid_path');
  const n=path.posix.normalize(q);
  // Windows silently drops trailing dots/spaces (".env." -> ".env"), which would bypass the denylist.
  if (n==='.' || n.split('/').some(seg=>seg && /[. ]$/.test(seg))) throw fail('invalid_path','invalid_path');
  return n;
}
function globRe(glob) {
  const g=glob.replaceAll('\\','/'); let out='';
  for (let i=0;i<g.length;i++) {
    const c=g[i];
    if (c==='*') {
      if (g[i+1]==='*') { if (g[i+2]==='/') { out+='(?:.*/)?'; i+=2; } else { out+='.*'; i+=1; } }
      else out+='[^/]*';
    } else if (c==='?') out+='[^/]';
    else out+=c.replace(/[.+^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp('^'+out+'$','i');
}
function patternRe(pattern) {
  const p=String(pattern).replaceAll('\\','/').replace(/^\.\//,'');
  return globRe(p.endsWith('/')?`${p}**`:p);
}
export function forbiddenPatterns(task={},config={}) {
  const explicit=(task?.forbidden_files||[]).filter(Boolean).map(String);
  const list=[...new Set([...DEFAULT_FORBIDDEN,...(config?.security?.forbidden_files||[]).filter(Boolean).map(String),...explicit])];
  // Patterns named by the TASK PACKAGE apply in full, even to .env.example-style documentation.
  return Object.defineProperty(list,'explicit',{value:new Set(explicit)});
}
export function forbiddenPath(p, patterns=DEFAULT_FORBIDDEN) {
  const n=normalizeRelative(p);
  const explicit=patterns.explicit||new Set();
  // .env.example/.sample/.template are documentation: generic .env patterns skip them, explicit ones still apply.
  if (SAFE_ENV_DOC.test(n)) return patterns.some(g=>(explicit.has(g) || !/\.env/i.test(g) || /\.(example|sample|template)/i.test(g)) && patternRe(g).test(n));
  return patterns.some(g=>patternRe(g).test(n));
}
export function pathAllowed(p, allowed=[], forbidden=DEFAULT_FORBIDDEN) {
  const n=normalizeRelative(p);
  if (forbiddenPath(n,forbidden)) return false;
  if (!allowed?.length) return false;
  return allowed.some(a=>{ const na=normalizeRelative(String(a).replace(/\/+$/,'')); return String(a).endsWith('/')?n.startsWith(na+'/'):n===na || n.startsWith(na+'/'); });
}
/** Preflight for TASK PACKAGE scope: traversal/absolute/Windows-trick paths block the task before any worker runs. */
export function validateTaskPaths(task={}) {
  for (const key of ['allowed_files','relevant_files']) {
    for (const p of task?.[key]||[]) {
      const s=String(p);
      // These lists are literal paths (only forbidden_files takes patterns); name the glob instead of a bare invalid_path.
      if (/[*?]/.test(s)) throw fail(`glob_not_supported:${key}:${s}`,'glob_not_supported');
      normalizeRelative(s.replace(/\/+$/,''));
    }
  }
}
/** relevant_files the workers will not send: only files inside allowed_files and outside the denylist reach the model. */
export function relevantNotSent(task={},config={}) {
  const forbidden=forbiddenPatterns(task,config);
  // Invalid paths are reported by validateTaskPaths, not here.
  return (task?.relevant_files||[]).map(String).filter(p=>{ try { return !pathAllowed(p,task.allowed_files,forbidden); } catch { return false; } });
}
export function splitCommand(input) {
  if (!input || META.test(input)) throw fail('unsafe_test_command','unsafe_test_command');
  const out=[]; let cur=''; let q=null; let esc=false;
  for (const ch of input.trim()) {
    if (esc) { cur+=ch; esc=false; continue; }
    if (ch==='\\' && q==='"') { esc=true; continue; }
    if ((ch==='"'||ch==="'") && (!q||q===ch)) { q=q?null:ch; continue; }
    if (/\s/.test(ch) && !q) { if(cur){out.push(cur);cur='';} } else cur+=ch;
  }
  if(q) throw fail('unclosed_quote','unsafe_test_command'); if(cur) out.push(cur); return out;
}
export function validateTestCommand(input, allow=DEFAULT_TEST_EXECUTABLES) {
  const argv=splitCommand(input); if(!argv.length) throw fail('empty_command','unsafe_test_command');
  // Bare names only: a path could point at a worker-written or arbitrary binary with an allowlisted basename.
  if(/[\\/]/.test(argv[0])) throw fail('test_executable_path_not_allowed','unsafe_test_command');
  const exe=argv[0].replace(/\.(cmd|exe)$/i,'').toLowerCase();
  // Package runners download and execute arbitrary packages.
  if(PKG_RUNNERS.has(exe)) throw fail('package_runner_not_allowed','unsafe_test_command');
  if(!(allow||DEFAULT_TEST_EXECUTABLES).map(x=>String(x).toLowerCase()).includes(exe)) throw fail('test_executable_not_allowed','unsafe_test_command');
  const lower=argv.join(' ').toLowerCase();
  for(const bad of ['reset --hard','clean -fd','clean -fdx','push --force','push -f','--force-with-lease']) if(lower.includes(bad)) throw fail('forbidden_command','forbidden_command');
  // data: URLs carry inline code (module, reporter, config) that never appears as a reviewed file.
  if(argv.some(a=>/data:/i.test(a))) throw fail('inline_code_not_allowed','unsafe_test_command');
  // Tests may inspect git state but never write history, write files or talk to remotes.
  if(exe==='git' && (!GIT_READONLY.has(String(argv[1]||'').toLowerCase()) || argv.slice(2).some(gitArgUnsafe))) throw fail('forbidden_command','forbidden_command');
  if(exe==='node') {
    // Inline code, preloads and loaders would run text that never appears as a reviewed file.
    for(const a of argv.slice(1)) { if(!a.startsWith('-') || a==='--') break; if(!NODE_SAFE_FLAG.test(a)) throw fail('node_option_not_allowed','unsafe_test_command'); }
  }
  if(PKG_MANAGERS.has(exe)) {
    const sub=String(argv[1]||'').toLowerCase();
    if(PKG_FORBIDDEN.has(sub)) throw fail('forbidden_command','forbidden_command');
    if(!PKG_RUN.has(sub)) throw fail('package_command_not_allowed','unsafe_test_command');
    let i=2;
    if(sub==='run' || sub==='run-script') { if(!/^[A-Za-z0-9:_.-]+$/.test(argv[2]||'')) throw fail('invalid_script_name','unsafe_test_command'); i=3; }
    // Flags before "--" are package-manager config (e.g. --script-shell); after "--" they go to the script.
    for(;i<argv.length;i++) { const a=argv[i]; if(a==='--') break; if(a.startsWith('-') && !PKG_SAFE_FLAG.has(a)) throw fail('package_option_not_allowed','unsafe_test_command'); }
  }
  return argv;
}
export function git(root,args,{allowFailure=false}={}) {
  const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
  if(r.error || (!allowFailure && r.status!==0)) throw new Error(`git_failed:${args.join(' ')}:${(r.stderr||r.error?.message||'').trim()}`);
  return r;
}
export function statusEntries(root) {
  // -z keeps paths unquoted; --untracked-files=all lists files inside new directories instead of collapsing them.
  const raw=git(root,['status','--porcelain=v1','-z','--untracked-files=all']).stdout;
  const tokens=raw.split('\0'); const out=[];
  for(let i=0;i<tokens.length;i++){
    const t=tokens[i]; if(!t) continue;
    const xy=t.slice(0,2); const entry={xy,path:t.slice(3)};
    if(/[RC]/.test(xy)) { entry.from=tokens[i+1]; i++; }
    out.push(entry);
  }
  return out;
}
export function trackedFiles(root) {
  return git(root,['ls-files','-z']).stdout.split('\0').filter(Boolean);
}
/** Tracked path inside .ai-router/. Case-insensitive: on Windows/macOS a committed .AI-ROUTER/ is the same folder. */
export function trackedRouterPath(tracked) {
  return tracked.find(p=>{ const l=p.toLowerCase(); return l==='.ai-router' || l.startsWith('.ai-router/'); });
}
function routerOnlyRuleChange(root,entry) {
  if(!RULE_FILES.includes(entry.path) || entry.from || /D/.test(entry.xy)) return false;
  const abs=path.join(root,entry.path); if(!fs.existsSync(abs)) return false;
  const current=fs.readFileSync(abs,'utf8');
  // Only the exact router block counts: any other text between the markers is a real edit.
  const blocks=extractAllRules(current);
  if(!blocks.length || blocks.some(b=>b!==RULES_BLOCK)) return false;
  const norm=s=>s.replace(/\r\n/g,'\n').replace(/\s+$/,'');
  const head=git(root,['show',`HEAD:${entry.path}`],{allowFailure:true});
  return norm(stripRules(current))===norm(stripRules(head.status===0?head.stdout:''));
}
export function ensureSafeRepo(root,{requireClean=true}={}) {
  const inside=git(root,['rev-parse','--is-inside-work-tree'],{allowFailure:true});
  if(inside.status!==0 || inside.stdout.trim()!=='true') throw fail('not_git_repo','not_git_repo');
  const tracked=trackedFiles(root);
  // Router config/state must stay local: a committed .ai-router/ could try to redirect keys, commands or budgets.
  const routerTracked=trackedRouterPath(tracked);
  if(routerTracked) throw fail(`tracked_router_config:${routerTracked}`,'tracked_router_config');
  const secret=tracked.find(p=>SECRET_TRACKED.test(p) && !SAFE_TRACKED_DOC.test(p));
  if(secret) throw fail(`tracked_secret:${secret}`,'tracked_secret');
  const entries=statusEntries(root);
  // The auto-init rule block in CLAUDE.md/AGENTS.md is router infrastructure; any other edit keeps the repo dirty.
  const relevant=entries.filter(e=>!routerOnlyRuleChange(root,e));
  const dirty=relevant.length>0;
  if(requireClean && dirty) throw fail('dirty_worktree','dirty_worktree');
  return {dirty,ignored_router_rule_changes:entries.length-relevant.length,tracked};
}
export function assertEffects(changed,allowed,forbidden,maxFiles=20) {
  if(changed.length>maxFiles) throw Object.assign(new Error('max_files_exceeded'),{code:'max_files_exceeded'});
  for(const p of changed) {
    let ok=false; try { ok=pathAllowed(p,allowed,forbidden); } catch { ok=false; }
    if(!ok) throw Object.assign(new Error(`scope_violation:${p}`),{code:'scope_violation'});
  }
}
function inside(parent,child){ const rel=path.relative(parent,child); return rel==='' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel)); }
export function safeResolve(root,rel,{forWrite=false}={}) {
  const n=normalizeRelative(rel); const rootReal=fs.realpathSync(root); const abs=path.join(rootReal,n);
  let probe=abs;
  while(!fs.existsSync(probe)) { const up=path.dirname(probe); if(up===probe) break; probe=up; }
  if(fs.existsSync(abs) && fs.lstatSync(abs).isSymbolicLink()) throw Object.assign(new Error(`symlink_rejected:${n}`),{code:'scope_violation'});
  if(!inside(rootReal,fs.realpathSync(probe))) throw Object.assign(new Error(`symlink_escape:${n}`),{code:'scope_violation'});
  if(!forWrite && fs.existsSync(abs) && !inside(rootReal,fs.realpathSync(abs))) throw Object.assign(new Error(`symlink_escape:${n}`),{code:'scope_violation'});
  return abs;
}
export function readAllowedFiles(root, files, maxChars=60000, allowed=files, forbidden=DEFAULT_FORBIDDEN) {
  const out=[];
  for(const rel of files||[]) {
    const n=normalizeRelative(rel); if(!pathAllowed(n,allowed,forbidden)) continue;
    const abs=safeResolve(root,n);
    if(!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    let content=fs.readFileSync(abs,'utf8'); if(content.length>maxChars) content=content.slice(0,maxChars)+'\n[TRUNCATED]';
    out.push({path:n,content});
  }
  return out;
}
