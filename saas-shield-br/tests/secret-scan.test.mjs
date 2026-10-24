// Testes do hook pre-commit-secret-scan.mjs, da lista secret-patterns.mjs, da regra de .env (env-public.mjs)
// e do CLI secret-scan.mjs (staged, histórico, commits que vão sair).
// Rodar: node --test saas-shield-br/tests/*.test.mjs
// As chaves falsas são montadas em tempo de execução: este arquivo não contém secret literal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SECRET_PATTERNS, isServiceRoleJwt, scanText } from '../scripts/security/secret-patterns.mjs'
import { isPublicEnvContent, envFileProblem } from '../scripts/security/env-public.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = join(ROOT, 'hooks', 'scripts', 'pre-commit-secret-scan.mjs')
const CLI = join(ROOT, 'scripts', 'security', 'secret-scan.mjs')

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (role, iss = 'supabase') =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss, ref: 'abcdefghijklmnopqrst', role, iat: 1700000000, exp: 2000000000 })}.${'s'.repeat(43)}`
const SB_SECRET = ['sb', 'secret', 'A1b2C3d4E5f6G7h8I9j0K1l2M3'].join('_')
const SB_PUBLISHABLE = ['sb', 'publishable', 'A1b2C3d4E5f6G7h8I9j0K1l2M3'].join('_')

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
}

function repo(t, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shield-secret-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'teste@example.com')
  git(dir, 'config', 'user.name', 'Teste')
  git(dir, 'config', 'commit.gpgsign', 'false')
  write(dir, files)
  return dir
}

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
}

function run(command, cwd, tool = 'Bash') {
  const started = Date.now()
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd }),
    encoding: 'utf8',
  })
  return { code: r.status, stderr: r.stderr, ms: Date.now() - started }
}

test('commit composto com JWT service_role já staged é bloqueado', (t) => {
  const dir = repo(t, { 'src/admin.ts': `export const KEY = '${jwt('service_role')}'\n` })
  git(dir, 'add', '-A')
  const r = run('git add -A && git commit -m "feat: admin; v2"', dir)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /src\/admin\.ts:1/)
  assert.match(r.stderr, /supabase-service-role-jwt/)
  assert.doesNotMatch(r.stderr, new RegExp(jwt('service_role').slice(20, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'não ecoa a chave inteira')
})

test('JWT anon do Supabase não é secret', (t) => {
  const dir = repo(t, { 'src/supabase.ts': `export const ANON = '${jwt('anon')}'\n` })
  git(dir, 'add', '-A')
  assert.equal(run('git commit -m "chore: client"', dir).code, 0)
})

test('chave demo do supabase start (iss supabase-demo) não bloqueia', (t) => {
  const dir = repo(t, { 'supabase/.env.local.example': `SERVICE_ROLE_KEY=${jwt('service_role', 'supabase-demo')}\n` })
  git(dir, 'add', '-A')
  assert.equal(run('git commit -m "chore: env local"', dir).code, 0)
})

test('sb_secret_ é bloqueado; sb_publishable_ passa', (t) => {
  const bad = repo(t, { '.env.production': `SUPABASE_SECRET_KEY=${SB_SECRET}\n` })
  git(bad, 'add', '-A')
  const r = run('git commit -m x', bad)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /supabase-secret-key/)

  const ok = repo(t, { 'src/env.ts': `export const KEY = '${SB_PUBLISHABLE}'\n` })
  git(ok, 'add', '-A')
  assert.equal(run('git commit -m x', ok).code, 0)
})

test('arquivo com espaço no nome é lido e citado', (t) => {
  const dir = repo(t, { 'config/prod settings.ts': `const k = '${SB_SECRET}'\n` })
  git(dir, 'add', '-A')
  const r = run('git commit -m "x"', dir)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /config\/prod settings\.ts:1/)
})

test('git add no mesmo comando: varre o que o add vai colocar no índice', (t) => {
  const dir = repo(t, { 'novo arquivo.ts': `const k = '${jwt('service_role')}'\n` })
  const r = run('git add . && git commit -m x', dir)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /novo arquivo\.ts:1 \(working tree\)/)
})

test('add de outro arquivo não arrasta o arquivo não adicionado', (t) => {
  const dir = repo(t, { 'limpo.ts': 'export {}\n', 'segredo.ts': `const k = '${SB_SECRET}'\n` })
  assert.equal(run('git add limpo.ts && git commit -m x', dir).code, 0)
})

test('PowerShell: git add .; git commit', (t) => {
  const dir = repo(t, { 'src/a.ts': `const k = '${SB_SECRET}'\n` })
  const r = run('Set-Location src; git add .; git commit -m "x"', dir, 'PowerShell')
  assert.equal(r.code, 2)
  assert.match(r.stderr, /src\/a\.ts/)
})

test('git -C <repo> commit e cd <repo>; git commit a partir de outro diretório', (t) => {
  const dir = repo(t, { 'k.ts': `const k = '${SB_SECRET}'\n` })
  git(dir, 'add', '-A')
  const elsewhere = mkdtempSync(join(tmpdir(), 'shield-outside-'))
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
  assert.equal(run(`git -C "${dir}" commit -m x`, elsewhere).code, 2)
  assert.equal(run(`cd "${dir}"; git commit -m x`, elsewhere).code, 2)
  assert.equal(run(`bash -c "cd '${dir}' && git commit -m x"`, elsewhere).code, 2)
})

test('commit -a pega arquivo rastreado modificado; sem -a, não', (t) => {
  const dir = repo(t, { 'app.ts': 'export {}\n' })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  write(dir, { 'app.ts': `const k = '${SB_SECRET}'\n` })
  assert.equal(run('git commit -m "sem -a"', dir).code, 0)
  assert.equal(run('git commit -am "com -a"', dir).code, 2)
})

test('comandos que não são commit saem com 0 e rápido, mesmo com secret staged', (t) => {
  const dir = repo(t, { 'k.ts': `const k = '${SB_SECRET}'\n` })
  git(dir, 'add', '-A')
  for (const cmd of [
    'git status',
    'git log --grep commit',
    'git commit-tree HEAD^{tree} -m x',
    'echo "git commit -m x"',
    'ls -la',
    'gh pr create --title "git commit"',
  ]) {
    const r = run(cmd, dir)
    assert.equal(r.code, 0, cmd)
    assert.ok(r.ms < 3000, `${cmd} levou ${r.ms}ms`)
  }
})

test('chave de exemplo da documentação da AWS não bloqueia', (t) => {
  const dir = repo(t, { 'docs/aws.md': 'AKIAIOSFODNN7EXAMPLE\n' })
  git(dir, 'add', '-A')
  assert.equal(run('git commit -m docs', dir).code, 0)
})

test('fora de um repo git, não trava', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shield-norepo-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(run('git commit -m x', dir).code, 0)
})

test('isServiceRoleJwt decodifica o payload', () => {
  assert.equal(isServiceRoleJwt(jwt('service_role')), true)
  assert.equal(isServiceRoleJwt(jwt('anon')), false)
  assert.equal(isServiceRoleJwt(jwt('service_role', 'supabase-demo')), false)
  assert.equal(isServiceRoleJwt(`${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.${'s'.repeat(20)}`), false, 'sem iss do Supabase')
  assert.equal(isServiceRoleJwt('eyJxxx.nao-e-base64.yyy'), false)
})

test('todo id de secret-patterns.mjs está documentado no patterns.md', () => {
  const doc = readFileSync(join(ROOT, 'skills', 'secret-scanner', 'patterns.md'), 'utf8')
  assert.match(doc, /scripts\/security\/secret-patterns\.mjs/, 'patterns.md aponta o módulo canônico')
  const ids = SECRET_PATTERNS.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, 'ids únicos')
  for (const p of SECRET_PATTERNS) {
    assert.ok(doc.includes(`\`${p.id}\``), `id ${p.id} não documentado em patterns.md`)
    assert.ok(p.regex.global, `${p.id}: regex precisa da flag g`)
  }
})

// ─── padrões novos (out/2026): cada um tem um caso que DEVE bloquear ─────────
// Chaves falsas no formato de cada provedor, montadas em tempo de execução.
const FAKE = {
  'google-api-key': () => ['AI', 'za', 'Sy', 'Ab1'.repeat(11)].join(''),
  'deepseek-api-key': () => ['sk', 'a1b2'.repeat(8)].join('-'),
  'meta-access-token': () => ['E', 'AA', 'Bx9Z'.repeat(30)].join(''),
  'database-url-with-password': () => ['postgresql:', '', 'postgres.abcdefghijklmnopqrst:S3nh4F0rt3@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'].join('/'),
  'npm-access-token': () => ['npm', 'Ab12'.repeat(9)].join('_'),
  'supabase-personal-access-token': () => ['sbp', 'a1b2c3d4e5'.repeat(4)].join('_'),
}

test('padrões novos bloqueiam em código (não só em .env)', (t) => {
  for (const [id, make] of Object.entries(FAKE)) {
    const dir = repo(t, { 'src/config.ts': `export const K = '${make()}'\n` })
    git(dir, 'add', '-A')
    const r = run('git commit -m x', dir)
    assert.equal(r.code, 2, `${id} devia bloquear`)
    assert.match(r.stderr, new RegExp(`\\[${id}\\]`))
    assert.doesNotMatch(r.stderr, new RegExp(make().slice(12, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${id}: não ecoa a chave`)
  }
})

test('URL de banco de exemplo ou local não bloqueia', () => {
  for (const url of [
    ['postgresql:', '', 'user:password@host:5432/db'].join('/'),
    ['postgresql:', '', 'postgres:postgres@127.0.0.1:54322/postgres'].join('/'),
    ['postgres:', '', 'app:S3nh4F0rt3@localhost:5432/app'].join('/'),
    ['postgres:', '', 'app:${DB_PASSWORD}@db.example.com/app'].join('/'),
  ]) assert.deepEqual(scanText(`DATABASE_URL=${url}\n`), [], url)
})

test('base64 que contém EAA não vira token da Meta', () => {
  const blob = 'iVBORw0KGgo' + 'EAA' + 'Qx7'.repeat(40) + '+/w=='
  assert.deepEqual(scanText(`const img = "data:image/png;base64,${blob}"\n`).map((f) => f.id), [])
})

test('linha marcada com secret-scan: ignore é suprimida', () => {
  assert.deepEqual(scanText(`const k = '${FAKE['npm-access-token']()}' // secret-scan: ignore\n`), [])
})

// ─── .env versionado: mesmos casos do gate do ai-router-br (tests/hardening.test.mjs) ─────
test('.env só com variáveis públicas passa; qualquer outra coisa bloqueia', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ'
  const pem = ['-----BEGIN', 'CERTIFICATE-----'].join(' ')
  for (const [content, ok] of [
    ['# URL do backend\nNEXT_PUBLIC_API_URL=https://backend.vercel.app\n', true],
    ['﻿VITE_SUPABASE_URL="https://x.supabase.co"\r\nexport VITE_APP_NAME=Margin\r\n\r\n', true],
    ['NEXT_PUBLIC_API_URL=https://x\nDATABASE_URL=https://db\n', false],
    [`VITE_SUPABASE_ANON_KEY=${jwt}\n`, false],
    ['VITE_MAPS_API_KEY=abc\n', false],
    [`NEXT_PUBLIC_X=${['sb', 'secret', 'abcdef'].join('_')}\n`, false],
    ['NEXT_PUBLIC_DB=postgres://user:pass@host/db\n', false],
    [`VITE_A=1\n${pem}\nMIIE\n`, false],
    [`VITE_CERT=${pem}\n`, false],
    ['VITE_A="multi\nline"\n', false],
  ]) assert.equal(isPublicEnvContent(content), ok, JSON.stringify(content))
  assert.equal(envFileProblem('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=\n'), null, '.example é documentação')
  assert.equal(envFileProblem('src/env.ts', 'X=1'), null, 'não é arquivo .env')
  assert.equal(envFileProblem('apps/web/.env.production', 'VERCEL_TOKEN=abc\n')?.id, 'env-file-versionado')
})

test('hook: .env.production com segredo sem formato conhecido bloqueia pelo nome; só público passa', (t) => {
  const bad = repo(t, { '.env.production': 'ZAPI_TOKEN=4f2a9c\nVERCEL_TOKEN=abc123\n' })
  git(bad, 'add', '-A')
  const r = run('git commit -m x', bad)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /\.env\.production:1 .*\[env-file-versionado\]/)

  const ok = repo(t, { '.env.production': 'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\n', '.env.example': 'SUPABASE_SERVICE_ROLE_KEY=\n' })
  git(ok, 'add', '-A')
  assert.equal(run('git commit -m x', ok).code, 0)
})

// ─── git push: commits que ainda não saíram, inclusive feitos fora do Claude ──
function withRemote(t) {
  const remote = mkdtempSync(join(tmpdir(), 'shield-remote-'))
  t.after(() => rmSync(remote, { recursive: true, force: true }))
  git(remote, 'init', '-q', '--bare')
  const dir = repo(t, { 'README.md': 'oi\n' })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  git(dir, 'remote', 'add', 'origin', remote)
  git(dir, 'push', '-q', 'origin', 'HEAD:main')
  git(dir, 'fetch', '-q', 'origin')
  return dir
}

test('git push bloqueia commit local com segredo (feito fora do Claude, merge ou cherry-pick)', (t) => {
  const dir = withRemote(t)
  write(dir, { 'k.env.ts': `export const K = '${jwt('service_role')}'\n` })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'feito no terminal, sem hook')
  const r = run('git push origin HEAD', dir)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /bloqueou o git push/)
  assert.match(r.stderr, /k\.env\.ts adicionado .*\[supabase-service-role-jwt\]/)
})

test('git push sem segredo nos commits novos passa', (t) => {
  const dir = withRemote(t)
  write(dir, { 'src/a.ts': 'export {}\n' })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'limpo')
  assert.equal(run('git push origin HEAD', dir).code, 0)
})

// ─── CLI: histórico (caso 8 da auditoria de out/2026) ─────────────────────────
function cli(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

function leakedThenRemoved(t) {
  const dir = repo(t, { '.env': `NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=${jwt('service_role')}\n` })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'feat: admin')
  git(dir, 'rm', '-q', '--cached', '.env')
  write(dir, { '.gitignore': '.env\n' })
  git(dir, 'add', '.gitignore')
  git(dir, 'commit', '-q', '-m', 'chore: remove .env')
  // migrations com service_role em minúsculas: o ruído que escondia a chave no git log -S
  for (let i = 1; i <= 4; i++) {
    write(dir, { [`supabase/migrations/000${i}.sql`]: Array.from({ length: 30 }, (_, j) => `grant select on public.t${i}_${j} to service_role;`).join('\n') + '\n' })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', `migration ${i}`)
  }
  return dir
}

test('CLI --history acha a service_role removida do código atual e não imprime o valor', (t) => {
  const dir = leakedThenRemoved(t)
  const r = cli(['--history'], dir)
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /\.env adicionado — .*\[supabase-service-role-jwt\]/)
  assert.match(r.out, /\.env removido — /)
  assert.match(r.out, /\.env versionado — .*\[env-file-versionado\]/)
  assert.match(r.out, /Rotacione\/revogue a chave no provedor/)
  assert.doesNotMatch(r.out, /eyJ[A-Za-z0-9_-]{10,}\.eyJ/, 'não imprime o JWT')
  // o que a skill mandava rodar antes não acha nada: a chave é base64 e não contém "service_role"
  const old = spawnSync('git', ['log', '-p', '--all', '-S', 'service_role'], { cwd: dir, encoding: 'utf8' }).stdout
  assert.doesNotMatch(old, /eyJ/, 'git log -S "service_role" não chega na chave')
  // e o estático (working tree) também não
  assert.equal(cli(['--staged'], dir).code, 0)
})

test('CLI --history em clone raso é INCONCLUSIVO (exit 2), não PASS', (t) => {
  const src = leakedThenRemoved(t)
  const shallow = mkdtempSync(join(tmpdir(), 'shield-shallow-'))
  t.after(() => rmSync(shallow, { recursive: true, force: true }))
  const c = spawnSync('git', ['clone', '-q', '--depth', '1', `file://${src}`, shallow], { encoding: 'utf8' })
  assert.equal(c.status, 0, c.stderr)
  const r = cli(['--history'], shallow)
  assert.equal(r.code, 2)
  assert.match(r.out, /INCONCLUSIVO: clone raso/)
})

test('CLI respeita .secret-scan-allow.json (com motivo) e --range limita o intervalo', (t) => {
  const dir = leakedThenRemoved(t)
  const first = spawnSync('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim()
  write(dir, { '.secret-scan-allow.json': JSON.stringify({ allow: [
    { commit: first.slice(0, 12), file: '.env', id: 'supabase-service-role-jwt', reason: 'teste' },
    { commit: first.slice(0, 12), file: '.env', id: 'env-file-versionado', reason: 'teste' },
  ] }) })
  const r = cli(['--history'], dir)
  assert.equal(r.code, 1, 'a remoção (outro commit) continua aparecendo')
  assert.match(r.out, /2 suprimido\(s\)/)
  assert.equal(cli(['--range', `${first}..HEAD`], dir).code, 1, 'o commit que remove a chave está no intervalo')
  assert.equal(cli(['--range', 'HEAD~3..HEAD'], dir).code, 0, 'só migrations')
})

test('CLI fora de repo git é INCONCLUSIVO', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shield-norepo-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(cli(['--history', '--repo', dir], dir).code, 2)
})

// ─── MCP do GitHub: gravação direta no repositório, sem git commit no Bash ────
const MCP = join(ROOT, 'hooks', 'scripts', 'mcp-write-secret-scan.mjs')
function mcp(tool_name, tool_input) {
  const r = spawnSync(process.execPath, [MCP], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }), encoding: 'utf8' })
  return { code: r.status, stderr: r.stderr }
}

test('MCP create_or_update_file / push_files com segredo é bloqueado; limpo passa', () => {
  const one = mcp('mcp__github__create_or_update_file', { owner: 'o', repo: 'r', path: 'src/admin.ts', content: `const K = '${jwt('service_role')}'\n` })
  assert.equal(one.code, 2)
  assert.match(one.stderr, /src\/admin\.ts:1 .*\[supabase-service-role-jwt\]/)
  const many = mcp('mcp__github__push_files', { files: [{ path: 'README.md', content: 'oi\n' }, { path: '.env.production', content: 'ZAPI_TOKEN=abc\n' }] })
  assert.equal(many.code, 2)
  assert.match(many.stderr, /\.env\.production .*\[env-file-versionado\]/)
  assert.equal(mcp('mcp__github__push_files', { files: [{ path: 'src/a.ts', content: 'export {}\n' }] }).code, 0)
  assert.equal(mcp('mcp__github__create_or_update_file', { path: '.env.production', content: 'NEXT_PUBLIC_API_URL=https://x\n' }).code, 0)
})
