// Testes do hook check-sql-antipattern.mjs, do post-migration-edit.mjs e do hooks.json.
// Rodar: node --test saas-shield-br/tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = join(ROOT, 'hooks', 'scripts', 'check-sql-antipattern.mjs')
const POST = join(ROOT, 'hooks', 'scripts', 'post-migration-edit.mjs')
const PADRAO_SQL = join(ROOT, '..', 'padrao-saas', 'skills', 'aplicar', 'templates', 'sql')

const OK_MIGRATION = `-- Migration: fornecedores
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name       text not null,
  unique (company_id, id)
);
create index suppliers_company_idx on public.suppliers (company_id);

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;

create policy suppliers_select on public.suppliers for select to authenticated
  using (company_id in (select private.allowed_company_ids('financeiro.fornecedores.ver')));

revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
`

function migrations(t) {
  const dir = mkdtempSync(join(tmpdir(), 'shield-sql-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const m = join(dir, 'supabase', 'migrations')
  mkdirSync(m, { recursive: true })
  return m
}

function run(script, tool_name, tool_input) {
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }),
    encoding: 'utf8',
  })
  return { code: r.status, stderr: r.stderr, stdout: r.stdout }
}

const writeSql = (file_path, content) => run(HOOK, 'Write', { file_path, content })
const editSql = (file_path, old_string, new_string, replace_all = false) =>
  run(HOOK, 'Edit', { file_path, old_string, new_string, replace_all })

test('arquivos de referência do padrao-saas passam (Write em supabase/migrations/)', (t) => {
  const dir = migrations(t)
  for (const name of ['00_identidade_supabase', '00_identidade_postgres', '01_modelo_de_acesso', '02_exemplo_modulo_financeiro']) {
    const src = join(PADRAO_SQL, `${name}.sql`)
    assert.ok(existsSync(src), `${src} não existe`)
    const r = writeSql(join(dir, `20260101000000_${name}.sql`), readFileSync(src, 'utf8'))
    assert.equal(r.code, 0, `${name}: ${r.stderr}`)
  }
})

test('Edit de uma linha num arquivo que tem FORCE em outro ponto passa', (t) => {
  const dir = migrations(t)
  const file = join(dir, '20260101000000_suppliers.sql')
  writeFileSync(file, OK_MIGRATION)
  const r = editSql(file, '  name       text not null,', '  name       text not null check (length(name) > 0),')
  assert.equal(r.code, 0, r.stderr)
})

test('Edit que remove o FORCE é bloqueado', (t) => {
  const dir = migrations(t)
  const file = join(dir, '20260101000000_suppliers.sql')
  writeFileSync(file, OK_MIGRATION)
  const r = editSql(file, 'alter table public.suppliers force row level security;\n', '')
  assert.equal(r.code, 2)
  assert.match(r.stderr, /public\.suppliers com RLS sem FORCE/)
})

test('Edit com replace_all é aplicado ao arquivo inteiro', (t) => {
  const dir = migrations(t)
  const file = join(dir, '20260101000000_suppliers.sql')
  writeFileSync(file, OK_MIGRATION)
  assert.equal(editSql(file, 'suppliers', 'vendors', true).code, 0)
  // sem replace_all, só a 1ª ocorrência muda: o create table vira vendors e o RLS fica em suppliers
  assert.equal(editSql(file, 'create table public.suppliers', 'create table public.vendors').code, 2)
})

test('Edit criando arquivo novo usa o texto novo inteiro', (t) => {
  const dir = migrations(t)
  const r = editSql(join(dir, '20260101000000_novo.sql'), '', 'create table public.notes (id uuid primary key);\n')
  assert.equal(r.code, 2)
  assert.match(r.stderr, /public\.notes criada sem ENABLE ROW LEVEL SECURITY/)
})

test('tabela sem RLS é bloqueada; tabela fora de public e temp não', (t) => {
  const dir = migrations(t)
  const r = writeSql(join(dir, '20260101000000_x.sql'), 'create table if not exists invoices (id uuid primary key, company_id uuid not null);\n')
  assert.equal(r.code, 2)
  assert.match(r.stderr, /public\.invoices criada sem ENABLE ROW LEVEL SECURITY/)
  assert.equal(writeSql(join(dir, '20260101000001_y.sql'), 'create table private.jobs (id uuid primary key);\ncreate temp table t (id int);\n').code, 0)
})

test('ENABLE e FORCE no mesmo ALTER TABLE contam', (t) => {
  const dir = migrations(t)
  const sql = 'create table public.a (id uuid primary key);\nalter table public.a enable row level security, force row level security;\nrevoke all on public.a from anon;\n'
  assert.equal(writeSql(join(dir, '20260101000000_a.sql'), sql).code, 0)
})

test('DISABLE ROW LEVEL SECURITY é bloqueado', (t) => {
  const dir = migrations(t)
  assert.equal(writeSql(join(dir, '20260101000000_a.sql'), 'alter table public.orders disable row level security;\n').code, 2)
})

test('USING (true) e WITH CHECK (true) bloqueiam; em comentário, não', (t) => {
  const dir = migrations(t)
  const base = 'create table public.a (id uuid primary key);\nalter table public.a enable row level security;\nalter table public.a force row level security;\n'
  const r1 = writeSql(join(dir, '1.sql'), `${base}create policy a_all on public.a for select to authenticated using(true);\n`)
  assert.equal(r1.code, 2)
  assert.match(r1.stderr, /USING \(true\)/)
  const r2 = writeSql(join(dir, '2.sql'), `${base}create policy a_ins on public.a for insert to authenticated with check ( true );\n`)
  assert.equal(r2.code, 2)
  const r3 = writeSql(join(dir, '3.sql'), `${base}-- nunca use: create policy x on public.a using (true);\n/* using (true) */\n`)
  assert.equal(r3.code, 0, r3.stderr)
})

test('security definer sem search_path é bloqueado', (t) => {
  const dir = migrations(t)
  const r = writeSql(join(dir, '1.sql'), `create or replace function private.f()
returns uuid
language sql
stable
security definer
as $$ select private.current_user_id() $$;
`)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /private\.f é SECURITY DEFINER sem SET search_path/)
})

test('security definer com search_path em qualquer ordem de cláusula passa', (t) => {
  const dir = migrations(t)
  const variants = [
    `create function private.a() returns int language plpgsql security definer set search_path = '' as $$ begin return 1; end; $$;`,
    `create function private.b() returns int security definer language sql set search_path = '' as $$ select 1 $$;`,
    `create function private.c() returns int set search_path to '' stable security definer language sql as $fn$ select 1 $fn$;`,
    `create function private.d() returns int as $$ select 1 $$ language sql security definer set search_path = '';`,
    `create function private.e() returns int language sql security definer as $$ select 1 $$;\nalter function private.e() set search_path = '';`,
  ]
  for (const [i, sql] of variants.entries()) {
    const r = writeSql(join(dir, `${i}.sql`), sql + '\n')
    assert.equal(r.code, 0, `variante ${i}: ${r.stderr}`)
  }
})

test('search_path de uma função não cobre a security definer seguinte', (t) => {
  const dir = migrations(t)
  const r = writeSql(join(dir, '1.sql'), `create function private.ok() returns int language sql set search_path = '' as $$ select 1 $$;
create function private.ruim() returns int language sql security definer as $$ select 1 $$;
`)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /private\.ruim/)
  assert.doesNotMatch(r.stderr, /private\.ok /)
})

test('search_path = public avisa (P2) mas não bloqueia', (t) => {
  const dir = migrations(t)
  const r = writeSql(join(dir, '1.sql'), 'create function public.f() returns int language sql security definer set search_path = public as $$ select 1 $$;\n')
  assert.equal(r.code, 0)
  const ctx = JSON.parse(r.stdout).hookSpecificOutput
  assert.equal(ctx.hookEventName, 'PreToolUse')
  assert.match(ctx.additionalContext, /search_path diferente de ''/)
})

test('problema que já existia no arquivo vira aviso, não bloqueio', (t) => {
  const dir = migrations(t)
  const file = join(dir, '20240101000000_legado.sql')
  writeFileSync(file, 'create table public.legado (id uuid primary key, nome text);\n')
  const r = editSql(file, 'nome text', 'nome text not null')
  assert.equal(r.code, 0, r.stderr)
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /já existia/)
})

test('arquivo fora de migrations ou que não é .sql é ignorado', (t) => {
  const dir = migrations(t)
  const root = join(dir, '..', '..')
  assert.equal(writeSql(join(root, 'seed.sql'), 'create table public.x (id int);\n').code, 0)
  assert.equal(writeSql(join(dir, 'notas.md'), 'create table public.x (id int);\n').code, 0)
})

test('post-migration-edit devolve additionalContext só para migration', () => {
  const yes = run(POST, 'Edit', { file_path: '/repo/supabase/migrations/20260101000000_x.sql' })
  assert.equal(yes.code, 0)
  const out = JSON.parse(yes.stdout).hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /\/check-rls/)
  const no = run(POST, 'Edit', { file_path: '/repo/src/app.ts' })
  assert.equal(no.code, 0)
  assert.equal(no.stdout, '')
})

test('hooks.json: node + args, timeout, sem description por handler, if no secret scan', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'))
  const handlers = Object.values(cfg.hooks).flat().flatMap((g) => g.hooks.map((h) => ({ ...h, matcher: g.matcher })))
  assert.ok(handlers.length >= 4)
  for (const h of handlers) {
    assert.equal(h.command, 'node')
    assert.ok(Array.isArray(h.args) && h.args[0].startsWith('${CLAUDE_PLUGIN_ROOT}/hooks/scripts/'))
    assert.ok(existsSync(join(ROOT, h.args[0].replace('${CLAUDE_PLUGIN_ROOT}/', ''))), h.args[0])
    assert.equal(typeof h.timeout, 'number')
    assert.equal('description' in h, false)
  }
  const scan = handlers.filter((h) => h.args[0].endsWith('pre-commit-secret-scan.mjs'))
  assert.deepEqual(scan.map((h) => h.if).sort(), ['Bash(*git*)', 'PowerShell(*git*)'])
  assert.ok(scan.every((h) => h.matcher === 'Bash|PowerShell'))
})
