// Testes do hook pre-commit-secret-scan.mjs e da lista secret-patterns.mjs.
// Rodar: node --test saas-shield-br/tests/*.test.mjs
// As chaves falsas são montadas em tempo de execução: este arquivo não contém secret literal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SECRET_PATTERNS, isServiceRoleJwt } from '../hooks/scripts/secret-patterns.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = join(ROOT, 'hooks', 'scripts', 'pre-commit-secret-scan.mjs')

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
  assert.match(doc, /hooks\/scripts\/secret-patterns\.mjs/, 'patterns.md aponta o módulo canônico')
  const ids = SECRET_PATTERNS.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, 'ids únicos')
  for (const p of SECRET_PATTERNS) {
    assert.ok(doc.includes(`\`${p.id}\``), `id ${p.id} não documentado em patterns.md`)
    assert.ok(p.regex.global, `${p.id}: regex precisa da flag g`)
  }
})
