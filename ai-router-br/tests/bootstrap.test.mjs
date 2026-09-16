import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { ensureInitialized } from '../lib/bootstrap.mjs';
import { mergeRules, stripRules, RULES_BLOCK, RULES_START } from '../lib/rules.mjs';
import { ensureSafeRepo } from '../lib/security.mjs';
import { redact } from '../lib/redact.mjs';
import { repo, rm, sh } from './helpers.mjs';
const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=(root,...args)=>{ const r=spawnSync(process.execPath,[path.join(pluginRoot,'scripts','ai-router.mjs'),...args,'--root',root],{encoding:'utf8',env:{...process.env,AI_ROUTER_WORKER:''}}); return {code:r.status,json:JSON.parse(r.stdout)}; };
const count=(s,sub)=>s.split(sub).length-1;

test('rules merge preserves content, is idempotent and dedupes',()=>{
  const original='# Projeto\r\n\r\nRegras minhas.\r\n';
  const once=mergeRules(original);
  assert.ok(once.startsWith(original)); assert.equal(mergeRules(once),once); assert.equal(count(once,RULES_START),1);
  assert.ok(once.includes(RULES_BLOCK.replace(/\n/g,'\r\n')));
  assert.equal(stripRules(once).replace(/\s+$/,''),original.replace(/\s+$/,''));
  const dup=`a\n\n${RULES_BLOCK}\n\nb\n\n${RULES_BLOCK}\n`;
  assert.equal(count(mergeRules(dup),RULES_START),1); assert.ok(mergeRules(dup).includes('b'));
  assert.equal(mergeRules(''),RULES_BLOCK+'\n');
});

test('auto-init on first router use in a brand-new repo, idempotent on second run',()=>{
  const d=repo({'README.md':'# app\n','CLAUDE.md':'# Minhas regras\n\nNão apagar.\n'});
  assert.equal(fs.existsSync(path.join(d,'.ai-router')),false);
  const first=cli(d,'dry-run','--objective','Implementar módulo de fornecedores no backend e frontend em vários arquivos.');
  assert.equal(first.code,0); assert.equal(first.json.auto_init.status,'created');
  assert.equal(first.json.tier,1); assert.equal(first.json.executor,'codex'); assert.equal(first.json.review_required,true);
  for (const f of ['config.yml','STATE.md','REPORT.md','TASKS','RESULTS']) assert.ok(fs.existsSync(path.join(d,'.ai-router',f)),f);
  const exclude=fs.readFileSync(path.join(d,'.git','info','exclude'),'utf8');
  assert.equal(count(exclude,'.ai-router/'),1);
  const claude=fs.readFileSync(path.join(d,'CLAUDE.md'),'utf8'); const agents=fs.readFileSync(path.join(d,'AGENTS.md'),'utf8');
  assert.ok(claude.startsWith('# Minhas regras\n\nNão apagar.\n')); assert.equal(count(claude,RULES_START),1);
  assert.equal(agents,RULES_BLOCK+'\n');
  // Nothing secret-like is created, and router files stay out of git.
  const status=sh(d,['status','--porcelain','--untracked-files=all']).stdout;
  assert.ok(!status.includes('.ai-router')); assert.match(status,/CLAUDE\.md/); assert.match(status,/AGENTS\.md/);
  for (const f of fs.readdirSync(path.join(d,'.ai-router'),{recursive:true})) { const p=path.join(d,'.ai-router',f); if(fs.statSync(p).isFile()) { const s=fs.readFileSync(p,'utf8'); assert.equal(redact(s),s,f); } }
  for (const s of [claude,agents]) assert.equal(redact(s),s);
  // Rule-block-only edits do not block external workers.
  assert.equal(ensureSafeRepo(d).dirty,false);
  const snapshot=()=>['CLAUDE.md','AGENTS.md','.git/info/exclude','.ai-router/config.yml','.ai-router/STATE.md'].map(f=>fs.readFileSync(path.join(d,f),'utf8')).join('');
  const before=snapshot();
  const second=cli(d,'dry-run','--objective','Implementar módulo de fornecedores no backend e frontend em vários arquivos.');
  assert.equal(second.json.auto_init,'existing'); assert.equal(second.json.tier,1); assert.equal(snapshot(),before);
  // Any other edit to CLAUDE.md is a real dirty change.
  fs.appendFileSync(path.join(d,'CLAUDE.md'),'\nOutra regra.\n');
  assert.throws(()=>ensureSafeRepo(d),/dirty_worktree/);
  rm(d);
});

test('auto-init from a subdirectory targets the git top-level',()=>{
  const d=repo({'packages/app/index.js':'x\n'});
  const r=cli(path.join(d,'packages','app'),'classify','--objective','Inventariar arquivos e catalogar referências repetitivas do projeto.');
  assert.equal(r.json.auto_init.status,'created'); assert.ok(fs.existsSync(path.join(d,'.ai-router','config.yml')));
  assert.ok(!fs.existsSync(path.join(d,'packages','app','.ai-router'))); assert.equal(r.json.executor,'deepseek');
  rm(d);
});

test('auto-init never writes into the home directory, agent config folders or inside workers',()=>{
  // A disposable fake home that is also a git repository (dotfiles-style), so only the guard can stop the write.
  const fakeHome=repo({'README.md':'dotfiles\n','.claude/settings.json':'{}\n','.codex/config.toml':'\n'});
  const home=ensureInitialized(fakeHome,pluginRoot,{env:{},home:fakeHome});
  assert.equal(home.status,'skipped'); assert.equal(home.reason,'home_or_filesystem_root');
  for (const dir of ['.claude','.codex']) {
    const r=ensureInitialized(path.join(fakeHome,dir),pluginRoot,{env:{},home:fakeHome});
    assert.equal(r.status,'skipped',dir);
  }
  assert.ok(!fs.existsSync(path.join(fakeHome,'.ai-router'))); assert.ok(!fs.existsSync(path.join(fakeHome,'CLAUDE.md')));
  const d=repo();
  const w=ensureInitialized(d,pluginRoot,{env:{AI_ROUTER_WORKER:'1'}});
  assert.equal(w.status,'skipped'); assert.ok(!fs.existsSync(path.join(d,'.ai-router')));
  rm(d); rm(fakeHome);
});

test('non-git directory is left untouched (classification still works with plugin defaults)',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'router-nogit-'));
  const r=ensureInitialized(d,pluginRoot,{env:{}});
  assert.equal(r.status,'skipped'); assert.equal(r.reason,'not_git_repo'); assert.deepEqual(fs.readdirSync(d),[]);
  const c=cli(d,'dry-run','--objective','Inventariar arquivos e catalogar referências repetitivas do projeto.');
  assert.equal(c.code,0); assert.equal(c.json.auto_init.reason,'not_git_repo'); assert.equal(c.json.executor,'deepseek'); assert.deepEqual(fs.readdirSync(d),[]);
  rm(d);
});

test('auto-init does not write into a committed .ai-router/ (any letter case)',()=>{
  for (const dir of ['.ai-router','.AI-Router']) {
    const d=repo({'a.txt':'x\n',[`${dir}/config.yml`]:'version: 1\n'});
    const r=ensureInitialized(d,pluginRoot,{env:{}});
    assert.equal(r.status,'skipped',dir); assert.equal(r.reason,'tracked_router_dir',dir);
    assert.equal(sh(d,['status','--porcelain','--untracked-files=all']).stdout,''); assert.ok(!fs.existsSync(path.join(d,'CLAUDE.md')));
    rm(d);
  }
});
