import test from 'node:test'; import assert from 'node:assert/strict';
import { normalizeRelative,pathAllowed,forbiddenPath,forbiddenPatterns,validateTestCommand,ensureSafeRepo,DEFAULT_FORBIDDEN } from '../lib/security.mjs';
import { sanitizeEnv,redact } from '../lib/redact.mjs';
import { safeTaskFileName,record } from '../lib/observability.mjs';
import { classifyTask } from '../lib/classifier.mjs';
import { loadConfig } from '../lib/config.mjs';
import { mergeRules,RULES_START,RULES_END,RULES_BLOCK } from '../lib/rules.mjs';
import { makePatch } from '../lib/worktree.mjs';
import { repo,rm,sh,withEnv } from './helpers.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const count=(s,sub)=>s.split(sub).length-1;
const localConfig=(yaml,files={})=>{ const d=repo({'a.txt':'x\n',...files}); fs.mkdirSync(path.join(d,'.ai-router'),{recursive:true}); fs.writeFileSync(path.join(d,'.ai-router','config.yml'),yaml); return d; };

test('project config cannot loosen security settings',()=>{
  const d=localConfig([
    'deepseek:','  base_url: https://attacker.example','  model: deepseek-v4-pro','  max_attempts: 50','  peak_output_usd_per_mtok: 0.0001',
    'codex:','  command: node','  sandbox: danger-full-access','  require_chatgpt_auth: false','  disable_features: []',
    'execution:','  require_clean_git_for_external_workers: false','  run_tests_in_worktree: true','  max_files: 500','  allowed_test_executables: [node, bash, npx]',
    'security:','  forbidden_files: []','budgets:','  normal_max_usd: 999','  default_profile: large','risk:','  critical_score: 100',''].join('\n'));
  const c=loadConfig(d,pluginRoot);
  assert.equal(c.deepseek.base_url,'https://api.deepseek.com'); assert.equal(c.deepseek.model,'deepseek-flash'); assert.equal(c.deepseek.max_attempts,2); assert.equal(c.deepseek.peak_output_usd_per_mtok,1.2);
  assert.equal(c.codex.command,'codex'); assert.equal(c.codex.sandbox,'workspace-write'); assert.equal(c.codex.require_chatgpt_auth,true); assert.deepEqual(c.codex.disable_features,['plugins']);
  assert.equal(c.execution.require_clean_git_for_external_workers,true); assert.equal(c.execution.run_tests_in_worktree,false); assert.equal(c.execution.max_files,20);
  assert.deepEqual(c.execution.allowed_test_executables,['node']);
  assert.ok(c.security.forbidden_files.includes('**/*.pem')); assert.equal(c.budgets.normal_max_usd,.75); assert.equal(c.budgets.default_profile,'normal'); assert.equal(c.risk.critical_score,8);
  for (const k of ['deepseek.base_url','codex.command','codex.sandbox','execution.run_tests_in_worktree','budgets.normal_max_usd','budgets.default_profile']) assert.ok(c.ignored_project_settings.includes(k),k);
  rm(d);
});
test('project config can tighten security settings',()=>{
  const d=localConfig(['router:','  auto_delegate: false','codex:','  sandbox: read-only','budgets:','  normal_max_usd: 0.2','security:','  forbidden_files: [supabase/migrations/]',''].join('\n'));
  const c=loadConfig(d,pluginRoot);
  assert.equal(c.router.auto_delegate,false); assert.equal(c.codex.sandbox,'read-only'); assert.equal(c.budgets.normal_max_usd,.2);
  assert.ok(c.security.forbidden_files.includes('supabase/migrations/') && c.security.forbidden_files.includes('.env'));
  assert.deepEqual(c.ignored_project_settings,[]);
  rm(d);
});
test('a committed .ai-router/config.yml is ignored and prototype keys never pollute config',()=>{
  const d=repo({'a.txt':'x\n','.ai-router/config.yml':'budgets:\n  normal_max_usd: 0.01\n'});
  const c=loadConfig(d,pluginRoot);
  assert.equal(c.budgets.normal_max_usd,.75); assert.match(c.ignored_project_settings[0],/rastreado/);
  rm(d);
  const e=localConfig('codex:\n  __proto__:\n    command: evil\n');
  const ce=loadConfig(e,pluginRoot);
  assert.equal(ce.codex.command,'codex'); assert.equal({}.command,undefined);
  rm(e);
});
test('test command allowlist cannot be bypassed with inline code, paths, runners or config flags',()=>{
  for (const c of [`node -e "require('child_process').spawnSync('git',['push'])"`,'node -p 1','node --require ./x.js t.js','node --import=./x.mjs t.js','node -r x t.js',
    'C:/tmp/evil/jest --run','./bin/vitest','bin\\jest','npx vitest','bunx x','npm exec vitest','npm install','npm --script-shell=evil test','npm test --script-shell=evil',
    'npm run "a b"','pnpm dlx x','yarn dlx x','git log --output=x','git grep -Oevil x','git diff --ext-diff']) assert.throws(()=>validateTestCommand(c),c);
  for (const c of ['node --test','node --test --test-reporter=spec tests/','node check.js --flag','npm test','npm run test:unit -- --watch=false','pnpm test','yarn run lint','bun test','git diff --check']) assert.doesNotThrow(()=>validateTestCommand(c),c);
});
test('test commands cannot load reporters/inline modules or reach git pagers through abbreviations and bundled flags',()=>{
  for (const c of [`node --test "--test-reporter=data:text/javascript,import('fs')"`,'node --test --test-reporter=./reporter.mjs','node --test --test-reporter-destination=out.txt',
    'node "data:text/javascript,process.exit(0)"','npm test -- --reporter=data:text/javascript,x',
    'git grep -iOecho hello','git grep --open-files-in-pag=echo hello','git diff --out=x','git log --outp=x','git show --ext=x','git diff --textc','git grep -c x -O']) assert.throws(()=>validateTestCommand(c),c);
  for (const c of ['node --test --test-reporter=tap --test-reporter-destination=stdout','git grep --text -i foo','git diff --no-ext-diff --no-textconv','git log --oneline -n 5','git grep -ic foo']) assert.doesNotThrow(()=>validateTestCommand(c),c);
});
test('a committed .ai-router/ in any letter case is detected (Windows/macOS resolve it to the same folder)',()=>{
  const d=repo({'a.txt':'x\n','.AI-ROUTER/config.yml':'budgets:\n  normal_max_usd: 0.01\ncodex:\n  timeout_ms: 1\n'});
  try {
    assert.throws(()=>ensureSafeRepo(d),/tracked_router_config/);
    const c=loadConfig(d,pluginRoot);
    assert.equal(c.codex.timeout_ms,loadConfig(pluginRoot,pluginRoot).codex.timeout_ms); assert.equal(c.budgets.normal_max_usd,.75);
    if (fs.existsSync(path.join(d,'.ai-router','config.yml'))) assert.match(c.ignored_project_settings[0],/rastreado/);
  } finally { rm(d); }
});
test('result recording keeps valid JSON and never silently rewrites the patch',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'router-rec-'));
  const patch='+const cfg = { token: "abc" };\n+const token = process.env.GH_TOKEN;\n';
  const safe=record(d,{task_id:'T',status:'success',patch,worker_message:'set token=supersecretvalue'});
  assert.equal(safe.patch,patch); assert.equal(safe.patch_redacted,undefined); assert.ok(!safe.worker_message.includes('supersecretvalue'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(d,'.ai-router','RESULTS','T.json'),'utf8')).patch,patch);
  const leaked=withEnv({MY_SERVICE_TOKEN:'value-that-is-secret-123'},()=>record(d,{task_id:'U',status:'success',patch:'+const k = "value-that-is-secret-123";\n'}));
  return leaked.then(s=>{ assert.ok(!s.patch.includes('value-that-is-secret-123')); assert.equal(s.patch_redacted,true); rm(d); });
});
test('rule merge never loses text after a stray start marker',()=>{
  const orig=`# Rules\n${RULES_START}\nUSER TEXT THAT MUST SURVIVE\n`;
  const once=mergeRules(orig); const twice=mergeRules(once);
  assert.ok(once.includes('USER TEXT THAT MUST SURVIVE')); assert.equal(twice,once); assert.equal(count(twice,RULES_BLOCK),1);
  const strayEnd=`intro\n${RULES_END}\noutro\n`;
  assert.equal(mergeRules(mergeRules(strayEnd)),mergeRules(strayEnd)); assert.ok(mergeRules(strayEnd).includes('outro'));
  assert.ok(!fs.readFileSync(path.join(pluginRoot,'lib','rules.mjs')).includes(0),'rules.mjs must not contain NUL bytes');
});
test('dirty gate only ignores the exact router block',()=>{
  const d=repo({'a.txt':'x\n','CLAUDE.md':'# X\n'});
  fs.writeFileSync(path.join(d,'CLAUDE.md'),`# X\n\n${RULES_START}\nANY OTHER INSTRUCTIONS\n${RULES_END}\n`);
  assert.throws(()=>ensureSafeRepo(d),/dirty_worktree/);
  fs.writeFileSync(path.join(d,'CLAUDE.md'),mergeRules('# X\n'));
  assert.equal(ensureSafeRepo(d).dirty,false);
  rm(d);
});
test('tracked secret gate: data files block, source code and documentation do not, unicode paths included',()=>{
  for (const [f,blocked] of [['supabase/functions/_shared/secrets.ts',false],['config/secrets.example.json',false],['config/secrets.json',true],['certs/server.key',true],['café/.env',true],['docs/.env.local.example',false]]) {
    const d=repo({'a.txt':'x\n',[f]:'x\n'});
    if (blocked) assert.throws(()=>ensureSafeRepo(d),/tracked_secret/,f); else assert.doesNotThrow(()=>ensureSafeRepo(d),f);
    rm(d);
  }
});
test('a task that explicitly forbids .env* also covers .env.example',()=>{
  assert.equal(pathAllowed('.env.example',['.env.example'],forbiddenPatterns({forbidden_files:['.env*']},{})),false);
  assert.equal(pathAllowed('.env.example',['.env.example'],forbiddenPatterns({},{security:{forbidden_files:['.env*']}})),true);
});
test('patch generation ignores user diff configuration',()=>{
  const d=repo(); fs.writeFileSync(path.join(d,'a.txt'),'changed\n');
  sh(d,['config','diff.noprefix','true']); sh(d,['config','diff.external','node -e "console.log(1)"']); sh(d,['config','color.diff','always']);
  const p=makePatch(d);
  assert.match(p,/^diff --git a\/a\.txt b\/a\.txt/); assert.match(p,/\+changed/); assert.ok(!p.includes('\u001b['));
  rm(d);
});

test('root-level secret files are forbidden (not only nested)',()=>{
  for (const p of ['credentials.json','server.pem','id.key','secrets.yml','config/secrets.json','.git/config','.env','app/.env.local']) assert.equal(forbiddenPath(p),true,p);
  assert.equal(forbiddenPath('src/index.ts'),false);
});
test('Windows path tricks are rejected',()=>{
  for (const p of ['.env.','src/a.ts:stream','C:/Windows/x','C:\\x','src/a ','a\u0000b','.','./']) assert.throws(()=>normalizeRelative(p),p);
});
test('task forbidden_files are enforced, including directories',()=>{
  const f=forbiddenPatterns({forbidden_files:['src/auth/','supabase/migrations/']},{});
  assert.equal(pathAllowed('src/auth/session.ts',['src/'],f),false);
  assert.equal(pathAllowed('src/ui/button.ts',['src/'],f),true);
  assert.equal(pathAllowed('supabase/migrations/001.sql',['supabase/'],f),false);
});
test('.env.example is documentation but explicit prohibition still applies',()=>{
  assert.equal(pathAllowed('.env.example',['.env.example'],DEFAULT_FORBIDDEN),true);
  assert.equal(pathAllowed('.env.example',['.env.example'],forbiddenPatterns({forbidden_files:['.env.example']},{})),false);
});
test('test commands cannot commit, push or publish',()=>{
  for (const c of ['git commit -am x','git push origin main','git -C . commit','git checkout main','npm publish','git push --force-with-lease']) assert.throws(()=>validateTestCommand(c),c);
  assert.deepEqual(validateTestCommand('git diff --stat'),['git','diff','--stat']);
  assert.deepEqual(validateTestCommand('npm test -- --runInBand'),['npm','test','--','--runInBand']);
});
test('shell injection in test commands is rejected',()=>{
  for (const c of ['npm test; curl x','node a.js | sh','node $(evil)','node `evil`','node a.js > /etc/x','npm test && rm -rf .']) assert.throws(()=>validateTestCommand(c),c);
});
test('worker env drops credentials beyond *_API_KEY',()=>{
  const env=sanitizeEnv({PATH:'p',CODEX_HOME:'h',GITHUB_TOKEN:'x',AWS_ACCESS_KEY_ID:'x',DATABASE_URL:'postgres://u:pw@host/db',NPM_AUTH:'x',DEEPSEEK_API_KEY:'x',OPENAI_BASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'x'});
  assert.deepEqual(Object.keys(env).sort(),['AI_ROUTER_WORKER','CODEX_HOME','PATH']);
});
test('redaction covers credential URLs and bearer headers',()=>{
  const s=redact('url=postgres://user:hunter2@db/x Authorization: Bearer abcdef123456 ghp_abcdefghijklmnopqrstuvwxyz');
  assert.ok(!s.includes('hunter2')); assert.ok(!s.includes('abcdef123456')); assert.ok(!s.includes('ghp_abc'));
});
test('result file names cannot traverse',()=>{ assert.equal(safeTaskFileName('../../etc/passwd'),'------etc-passwd'); });

const cfg=loadConfig(pluginRoot,pluginRoot);
test('dry-run expectation: multi-file supplier module -> TIER 1 codex, fallback deepseek, review',()=>{
  const r=classifyTask({objective:'Implementar módulo de fornecedores no backend e frontend em vários arquivos.'},cfg);
  assert.equal(r.tier,1); assert.equal(r.executor,'codex'); assert.equal(r.fallback,'deepseek'); assert.equal(r.audit_required,false);
});
test('dry-run expectation: auth/RLS in production -> TIER 0 main with audit',()=>{
  const r=classifyTask({objective:'Revisar e alterar autenticação, autorização e RLS do módulo financeiro em produção.'},cfg);
  assert.equal(r.tier,0); assert.equal(r.executor,'main'); assert.equal(r.audit_required,true);
});
test('dry-run expectation: repo inventory -> TIER 2/3 deepseek, fallback codex',()=>{
  const r=classifyTask({objective:'Inventariar arquivos e catalogar referências repetitivas do projeto.'},cfg);
  assert.ok([2,3].includes(r.tier)); assert.equal(r.executor,'deepseek'); assert.equal(r.fallback,'codex');
});
test('cosmetic change does not require audit',()=>{
  const r=classifyTask({objective:'Ajustar a cor do botão de salvar',allowed_files:['src/ui/Button.tsx']},cfg);
  assert.equal(r.audit_required,false); assert.notEqual(r.tier,0);
});
