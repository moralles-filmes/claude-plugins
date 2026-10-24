// Testes dos git hooks do kit (.githooks/pre-commit e pre-push → scripts/security/secret-scan.mjs).
// Simulam quem commita fora do Claude Code: git de verdade, com core.hooksPath apontando para o kit.
// Rodar: node --test padrao-saas/tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'aplicar', 'assets', 'repo')
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const serviceRole = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'service_role' })}.${'s'.repeat(43)}`

function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function project(t) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-hooks-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(join(KIT, 'scripts', 'security'), join(dir, 'scripts', 'security'), { recursive: true })
  cpSync(join(KIT, '.githooks'), join(dir, '.githooks'), { recursive: true })
  for (const args of [['init', '-q'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't'], ['config', 'commit.gpgsign', 'false'], ['config', 'core.hooksPath', '.githooks']]) {
    assert.equal(git(dir, ...args).status, 0)
  }
  writeFileSync(join(dir, 'README.md'), 'oi\n')
  git(dir, 'add', '-A')
  assert.equal(git(dir, 'commit', '-q', '-m', 'base').status, 0)
  return dir
}

test('pre-commit do kit bloqueia commit humano com service_role e .env não público', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(t)
  writeFileSync(join(dir, 'admin.ts'), `export const K = '${serviceRole()}'\n`)
  git(dir, 'add', 'admin.ts')
  const r = git(dir, 'commit', '-m', 'feito no terminal')
  assert.notEqual(r.status, 0, 'o commit devia falhar')
  assert.match(r.stdout + r.stderr, /supabase-service-role-jwt/)
  git(dir, 'reset', '-q', 'admin.ts')

  writeFileSync(join(dir, '.env.production'), 'ZAPI_TOKEN=4f2a9c\n')
  git(dir, 'add', '.env.production')
  assert.notEqual(git(dir, 'commit', '-m', 'env').status, 0)
  git(dir, 'reset', '-q', '.env.production')

  writeFileSync(join(dir, '.env.production'), 'NEXT_PUBLIC_API_URL=https://app.example.com\n')
  git(dir, 'add', '.env.production')
  assert.equal(git(dir, 'commit', '-q', '-m', 'env público').status, 0, '.env só público passa')
})

test('pre-push do kit bloqueia commit com segredo que entrou com --no-verify', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(t)
  const remote = mkdtempSync(join(tmpdir(), 'kit-hooks-remote-'))
  t.after(() => rmSync(remote, { recursive: true, force: true }))
  git(remote, 'init', '-q', '--bare')
  git(dir, 'remote', 'add', 'origin', remote)
  assert.equal(git(dir, 'push', '-q', 'origin', 'HEAD:refs/heads/main').status, 0, 'push limpo passa')
  writeFileSync(join(dir, 'admin.ts'), `export const K = '${serviceRole()}'\n`)
  git(dir, 'add', 'admin.ts')
  assert.equal(git(dir, 'commit', '-q', '--no-verify', '-m', 'pulou o pre-commit').status, 0)
  const r = git(dir, 'push', 'origin', 'HEAD:refs/heads/main')
  assert.notEqual(r.status, 0, 'o push devia falhar')
  assert.match(r.stdout + r.stderr, /admin\.ts adicionado .*supabase-service-role-jwt/)
})
