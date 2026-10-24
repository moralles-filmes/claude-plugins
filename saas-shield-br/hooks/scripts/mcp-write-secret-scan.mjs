#!/usr/bin/env node
/**
 * Hook PreToolUse das ferramentas MCP do GitHub que gravam arquivo direto no repositório
 * (create_or_update_file, push_files). Esse caminho não passa por `git commit` no Bash, então o
 * pre-commit-secret-scan.mjs não vê: sessões na nuvem costumam commitar assim.
 *
 * Varre o conteúdo de cada arquivo com a mesma lista (scripts/security/secret-patterns.mjs) e a
 * regra de .env versionado (scripts/security/env-public.mjs).
 *
 * Saída: exit 0 permite; exit 2 + stderr bloqueia. Entrada ilegível → exit 0.
 */

import { readFileSync } from 'node:fs'
import { scanText } from '../../scripts/security/secret-patterns.mjs'
import { envFileProblem } from '../../scripts/security/env-public.mjs'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const input = payload?.tool_input ?? {}
const files = []
if (typeof input.path === 'string' && typeof input.content === 'string') files.push({ path: input.path, content: input.content })
if (Array.isArray(input.files)) {
  for (const f of input.files) if (typeof f?.path === 'string' && typeof f?.content === 'string') files.push(f)
}
if (files.length === 0) process.exit(0)

const findings = []
for (const { path, content } of files) {
  for (const s of scanText(content)) findings.push(`  - ${path}:${s.line} — ${s.name} [${s.id}] — ${s.preview}`)
  const env = envFileProblem(path, content)
  if (env) findings.push(`  - ${path} — ${env.name} [${env.id}]: ${env.reason}`)
}
if (findings.length === 0) process.exit(0)

process.stderr.write([
  `🛡️ saas-shield-br bloqueou ${payload?.tool_name ?? 'a gravação no GitHub'}: há secret no conteúdo que iria direto para o repositório.`,
  '',
  ...findings,
  '',
  'O que fazer:',
  '  1. Tire o secret do arquivo: variável de ambiente no servidor; .env fora do Git.',
  '  2. Rotacione a chave no provedor: ela já passou por esta sessão em texto puro.',
  '',
  'Falso-positivo? Mostre o trecho ao usuário e só siga com autorização explícita dele.',
].join('\n') + '\n')
process.exit(2)
