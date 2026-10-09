#!/usr/bin/env node
/**
 * Roda os testes pgTAP do SQL de referência do padrão nos DOIS adapters de identidade:
 *
 *   supabase : stub do Supabase + 00_identidade_supabase + 01 + 02 → testes 03 e 04
 *   postgres : 00_identidade_postgres + 01 + 02 → teste 03   (prova que o núcleo roda fora do Supabase)
 *
 * Requer `psql` e um Postgres 15+ com a extensão pgTAP instalada (postgresql-XX-pgtap).
 * A conexão vem das variáveis PG* de sempre (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
 * e o usuário precisa poder criar bancos e papéis. Cria bancos temporários e apaga no final.
 *
 * Uso:
 *   node padrao-saas/tests/run-sql-tests.mjs              # sem psql/servidor → avisa e sai 0
 *   node padrao-saas/tests/run-sql-tests.mjs --required   # sem psql/servidor → falha (CI)
 *   node padrao-saas/tests/run-sql-tests.mjs --keep       # não apaga os bancos (depuração)
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SQL = join(here, '..', 'skills', 'aplicar', 'templates', 'sql')
const STUB = join(here, 'sql', 'supabase-stub.sql')
const args = process.argv.slice(2)
const required = args.includes('--required')
const keep = args.includes('--keep')

const RUNS = [
  {
    name: 'supabase',
    setup: [STUB, join(SQL, '00_identidade_supabase.sql')],
    tests: ['03_modelo_de_acesso.test.sql', '04_identidade_supabase.test.sql'],
  },
  {
    name: 'postgres',
    setup: [join(SQL, '00_identidade_postgres.sql')],
    tests: ['03_modelo_de_acesso.test.sql'],
  },
]
const CORE = [join(SQL, '01_modelo_de_acesso.sql'), join(SQL, '02_exemplo_modulo_financeiro.sql')]

function psql(db, extra) {
  return spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, ...extra], { encoding: 'utf8' })
}

function skipOrFail(msg) {
  if (required) {
    console.error(`✗ ${msg}`)
    process.exit(1)
  }
  console.log(`NÃO EXECUTADO — testes SQL do padrão: ${msg}. Rode com Postgres + pgTAP (no CI rodam com --required).`)
  process.exit(0)
}

const probe = spawnSync('psql', ['-X', '-q', '-t', '-d', process.env.PGDATABASE || 'postgres', '-c', 'select 1'], { encoding: 'utf8' })
if (probe.error) skipOrFail('psql não encontrado')
if (probe.status !== 0) skipOrFail(`sem conexão com o Postgres (${(probe.stderr || '').trim().split('\n')[0]})`)

const admin = process.env.PGDATABASE || 'postgres'
let failures = 0

for (const run of RUNS) {
  const db = `padrao_sql_${run.name}_${process.pid}`
  const create = psql(admin, ['-c', `create database ${db}`])
  if (create.status !== 0) { console.error(create.stderr); process.exit(1) }
  try {
    // pgTAP fica no schema extensions, como no Supabase.
    const prep = psql(db, ['-c', `create schema extensions; alter database ${db} set search_path = "$user", public, extensions; grant usage on schema extensions to public;`])
    if (prep.status !== 0) throw new Error(prep.stderr)

    for (const file of [...run.setup, ...CORE]) {
      const r = psql(db, ['-f', file])
      if (r.status !== 0) throw new Error(`${run.name}: falha ao aplicar ${file}\n${r.stderr}`)
    }

    for (const test of run.tests) {
      const r = psql(db, ['-t', '-A', '-f', join(SQL, test)])
      const out = `${r.stdout}\n${r.stderr}`
      const plan = out.match(/^1\.\.(\d+)$/m)
      const oks = (out.match(/^ok \d+/gm) || []).length
      const notOks = out.match(/^not ok \d+.*$/gm) || []
      const expected = plan ? Number(plan[1]) : NaN
      const passed = r.status === 0 && notOks.length === 0 && oks === expected
      console.log(`${passed ? '✓' : '✗'} [${run.name}] ${test}: ${oks}/${Number.isNaN(expected) ? '?' : expected}`)
      if (!passed) {
        failures++
        for (const line of notOks) console.error(`    ${line}`)
        const diag = out.split('\n').filter(l => l.startsWith('#') || /ERROR|ERRO/.test(l)).slice(0, 30)
        for (const line of diag) console.error(`    ${line}`)
      }
    }
  } catch (e) {
    failures++
    console.error(`✗ [${run.name}] ${e.message}`)
  } finally {
    if (!keep) psql(admin, ['-c', `drop database if exists ${db}`])
  }
}

if (failures) {
  console.error(`\n✗ ${failures} falha(s) nos testes SQL do padrão`)
  process.exit(1)
}
console.log('✓ SQL de referência do padrão: testes pgTAP passaram nos adapters supabase e postgres')
