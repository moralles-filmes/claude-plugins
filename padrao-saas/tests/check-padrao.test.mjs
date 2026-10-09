// Testes do scripts/check-padrao.mjs do kit. Rodar: node --test padrao-saas/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'aplicar', 'assets', 'repo')
const SCRIPT = join(KIT, 'scripts', 'check-padrao.mjs')

function project(t) {
  const dir = mkdtempSync(join(tmpdir(), 'padrao-check-'))
  cpSync(KIT, dir, { recursive: true })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function check(dir, ...extra) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, ...extra], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` }
}

const std = (dir, f) => join(dir, 'docs', 'standards', f)
const config = (dir, obj) => {
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'padrao.json'), JSON.stringify(obj))
}

test('kit intacto passa', t => {
  const r = check(project(t))
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /Padrão SaaS conferido/)
})

test('padrão obrigatório apagado falha (bug da v3.1: passava em silêncio)', t => {
  const dir = project(t)
  rmSync(std(dir, 'GCP_MIGRATION.md'))
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /GCP_MIGRATION\.md ausente — padrão obrigatório/)
})

test('padrão opcional apagado sem declaração falha e explica como declarar', t => {
  const dir = project(t)
  rmSync(std(dir, 'PUBLIC_API.md'))
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /nao_adotados/)
})

test('padrão opcional declarado como não adotado, com motivo, passa', t => {
  const dir = project(t)
  rmSync(std(dir, 'PUBLIC_API.md'))
  config(dir, { nao_adotados: { 'PUBLIC_API.md': 'não emitimos chaves de API para clientes' } })
  const r = check(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /PUBLIC_API\.md: não adotado/)
})

test('declaração sem motivo falha', t => {
  const dir = project(t)
  rmSync(std(dir, 'PUBLIC_API.md'))
  config(dir, { nao_adotados: { 'PUBLIC_API.md': '' } })
  assert.equal(check(dir).code, 1)
})

test('padrão obrigatório não pode ser declarado como não adotado', t => {
  const dir = project(t)
  rmSync(std(dir, 'GCP_MIGRATION.md'))
  config(dir, { nao_adotados: { 'GCP_MIGRATION.md': 'portabilidade é objetivo futuro' } })
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /GCP_MIGRATION\.md é obrigatório/)
})

test('declarado como não adotado mas presente falha', t => {
  const dir = project(t)
  config(dir, { nao_adotados: { 'PUBLIC_API.md': 'não usamos' } })
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /mas o arquivo existe/)
})

test('corpo normativo editado falha; adaptação em Particularidades passa', t => {
  const dir = project(t)
  appendFileSync(std(dir, 'SECURITY.md'), '\nAdaptação do projeto: usamos Turnstile no login.\n')
  assert.equal(check(dir).code, 0, 'texto depois de "Particularidades" é livre')

  const file = std(dir, 'ARCHITECTURE.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Use **monólito modular', 'Use **microserviços'))
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /ARCHITECTURE\.md: corpo normativo editado/)
})

test('padrão desconhecido em docs/standards falha', t => {
  const dir = project(t)
  writeFileSync(std(dir, 'EXTRA.md'), '# Extra\n')
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /EXTRA\.md: não consta no manifest/)
})

test('CLAUDE.md sem @AGENTS.md falha', t => {
  const dir = project(t)
  writeFileSync(join(dir, 'CLAUDE.md'), '# Projeto\n')
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /não importa @AGENTS\.md/)
})

test('tenancy-profile ausente falha', t => {
  const dir = project(t)
  rmSync(join(dir, '.claude', 'tenancy-profile.yml'))
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /tenancy-profile\.yml ausente/)
})

test('AGENTS.md acima de 200 linhas só avisa', t => {
  const dir = project(t)
  appendFileSync(join(dir, 'AGENTS.md'), '\n' + '- linha\n'.repeat(120))
  const r = check(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /⚠ AGENTS\.md tem \d+ linhas/)
})

test('AGENTS.md aninhado desatualizado falha e --write-nested corrige', t => {
  const dir = project(t)
  appendFileSync(join(dir, '.claude', 'rules', 'banco-de-dados.md'), '\n- Regra nova do projeto.\n')
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /supabase\/AGENTS\.md desatualizado/)
  assert.equal(check(dir, '--write-nested').code, 0)
  assert.equal(check(dir).code, 0)
})

test('link relativo quebrado falha', t => {
  const dir = project(t)
  appendFileSync(join(dir, 'AGENTS.md'), '\nVeja [o runbook](docs/runbooks/NAO_EXISTE.md).\n')
  const r = check(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /link quebrado/)
})
