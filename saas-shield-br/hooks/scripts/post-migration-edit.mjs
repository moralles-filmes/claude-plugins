#!/usr/bin/env node
/**
 * Hook PostToolUse: depois de Edit/Write em supabase/migrations/*.sql,
 * sugere ao Claude rodar `/check-rls <arquivo>` ou invocar a skill rls-reviewer.
 *
 * Não bloqueia — apenas adiciona contexto.
 */

import { readFileSync } from 'node:fs'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path ?? ''
if (!/supabase[\\/]migrations[\\/].+\.sql$/i.test(filePath)) process.exit(0)

const msg = [
  '💡 saas-shield-br: você editou uma migration.',
  `   Considere rodar /check-rls ${filePath}`,
  '   ou invocar a skill rls-reviewer para validar antes de aplicar.',
].join('\n')

// stdout em PostToolUse vira contexto adicional para o Claude
process.stdout.write(msg + '\n')
process.exit(0)
