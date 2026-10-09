// Testes do scripts/check-portabilidade.mjs do kit. Rodar: node --test padrao-saas/tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'aplicar', 'assets', 'repo', 'scripts', 'check-portabilidade.mjs')

function project(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'padrao-port-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  write(dir, files)
  return dir
}

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
}

function run(dir, ...extra) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--json', ...extra], { encoding: 'utf8' })
  return { code: r.status, report: JSON.parse(r.stdout) }
}

const rulesAt = (report, file) => report.findings.filter(f => f.file === file).map(f => f.rule)

test('SDK na tela é violação; import type não é', t => {
  const dir = project(t, {
    'src/pages/Contas.tsx': `import { createClient } from '@supabase/supabase-js'\n`,
    'src/pages/Tipos.tsx': `import type { User } from '@supabase/supabase-js'\n`,
  })
  const { code, report } = run(dir)
  assert.equal(code, 1)
  assert.deepEqual(rulesAt(report, 'src/pages/Contas.tsx'), ['sdk-fora-do-adapter'])
  assert.deepEqual(rulesAt(report, 'src/pages/Tipos.tsx'), [])
})

test('import em várias linhas, dinâmico e require são pegos; typeof import não', t => {
  const dir = project(t, {
    'src/a.ts': `import {\n  createClient,\n  type User,\n} from '@supabase/supabase-js'\n`,
    'src/b.ts': `const m = await import('@supabase/supabase-js')\n`,
    'src/c.js': `const { createClient } = require("@supabase/supabase-js")\n`,
    'src/d.ts': `type C = typeof import('@/integrations/supabase/client').supabase\n`,
  })
  const { report } = run(dir)
  assert.equal(rulesAt(report, 'src/a.ts').length, 1)
  assert.equal(report.findings.find(f => f.file === 'src/a.ts').line, 4)
  assert.equal(rulesAt(report, 'src/b.ts').length, 1)
  assert.equal(rulesAt(report, 'src/c.js').length, 1)
  assert.deepEqual(rulesAt(report, 'src/d.ts'), [])
})

test('cliente do projeto (padrão Lovable) fora do adapter é violação; types não', t => {
  const dir = project(t, {
    'src/components/Lista.tsx': `import { supabase } from '@/integrations/supabase/client'\n`,
    'src/components/Tipos.tsx': `import { Tables } from '@/integrations/supabase/types'\n`,
    'src/hooks/useX.ts': `import { supabase } from '../lib/supabase'\n`,
  })
  const { report } = run(dir)
  assert.deepEqual(rulesAt(report, 'src/components/Lista.tsx'), ['sdk-fora-do-adapter'])
  assert.deepEqual(rulesAt(report, 'src/components/Tipos.tsx'), [])
  assert.deepEqual(rulesAt(report, 'src/hooks/useX.ts'), ['sdk-fora-do-adapter'])
})

test('adapters permitidos: features/<m>/api.ts, lib/supabase, adapters/, entrypoint da function', t => {
  const dir = project(t, {
    'src/features/financeiro/api.ts': `import { supabase } from '@/lib/supabase'\nexport const listar = () => supabase.from('bills').select('id')\n`,
    'src/lib/supabase/client.ts': `import { createClient } from '@supabase/supabase-js'\n`,
    'src/modules/estoque/adapters/supabase/repo.ts': `import { createClient } from '@supabase/supabase-js'\n`,
    'supabase/functions/baixar/index.ts': `import { createClient } from 'npm:@supabase/supabase-js@2'\nDeno.serve(() => new Response())\n`,
  })
  const { code, report } = run(dir)
  assert.equal(code, 0, JSON.stringify(report.findings))
  assert.equal(report.total, 0)
})

test('consulta direta com cliente vindo de contexto/hook é violação; Array.from não', t => {
  const dir = project(t, {
    'src/components/Tela.tsx': [
      `const { client } = useCompany()`,
      `const r = await client`,
      `  .from('bills')`,
      `  .select('*')`,
      `await client.rpc('baixar_conta_pagar', { p_bill_id: id })`,
      `await client.functions.invoke('enviar')`,
      `const letras = Array.from('abc')`,
    ].join('\n'),
  })
  const { report } = run(dir)
  const lines = report.findings.filter(f => f.rule === 'banco-direto-fora-do-adapter').map(f => f.line)
  assert.deepEqual(lines, [3, 5, 6])
})

test('Deno fora do entrypoint e dos adapters é violação; teste Deno é ignorado', t => {
  const dir = project(t, {
    'supabase/functions/_shared/dominio/regras.ts': `export const x = Deno.env.get('A')\n`,
    'supabase/functions/_shared/adapters/env.ts': `export const x = Deno.env.get('A')\n`,
    'supabase/functions/baixar/regras_test.ts': `Deno.test('x', () => {})\n`,
  })
  const { report } = run(dir)
  assert.deepEqual(report.findings.map(f => `${f.file}:${f.rule}`), [
    'supabase/functions/_shared/dominio/regras.ts:deno-fora-do-adapter',
  ])
})

test('empresa lida do token só é violação quando o profile diz active_source: url', t => {
  const code = `const companyId = session.user.app_metadata?.company_id\n`
  const semProfile = project(t, { 'src/lib/tenant.ts': code })
  assert.equal(run(semProfile).report.total, 0)

  const comProfile = project(t, {
    'src/lib/tenant.ts': code,
    '.claude/tenancy-profile.yml': 'archetype: E\ntenant:\n  active_source: url\n',
  })
  assert.deepEqual(rulesAt(run(comProfile).report, 'src/lib/tenant.ts'), ['empresa-no-token'])
})

test('linha de base: legado passa, dívida nova falha, melhora passa', t => {
  const dir = project(t, {
    'src/pages/Velha.tsx': `import { supabase } from '@/integrations/supabase/client'\nsupabase.from('a')\n`,
  })
  assert.equal(run(dir).code, 1)

  const w = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--write-baseline'], { encoding: 'utf8' })
  assert.equal(w.status, 0, w.stderr)
  assert.equal(run(dir).code, 0, 'dívida conhecida não quebra o CI')

  write(dir, { 'src/pages/Nova.tsx': `import { supabase } from '@/integrations/supabase/client'\n` })
  const nova = run(dir)
  assert.equal(nova.code, 1)
  assert.deepEqual(nova.report.regressions, ['src/pages/Nova.tsx'])

  write(dir, { 'src/pages/Nova.tsx': `export {}\n`, 'src/pages/Velha.tsx': `export {}\n` })
  assert.equal(run(dir).code, 0, 'menos dívida que a linha de base passa')
})

test('padrao.json pode trocar os caminhos permitidos e ignorar pastas', t => {
  const dir = project(t, {
    'src/data/repo.ts': `import { createClient } from '@supabase/supabase-js'\n`,
    'src/legacy/velho.ts': `import { createClient } from '@supabase/supabase-js'\n`,
    '.claude/padrao.json': JSON.stringify({ portabilidade: { permitidos: ['src/data/**'], ignorar: ['src/legacy/**'] } }),
  })
  const { code, report } = run(dir)
  assert.equal(code, 0, JSON.stringify(report.findings))
})
