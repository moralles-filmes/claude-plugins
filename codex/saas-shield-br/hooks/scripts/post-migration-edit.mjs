#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit|Write): depois de editar supabase/migrations/*.sql, sugere ao
 * Claude rodar `/check-rls <arquivo>` ou a skill rls-reviewer antes de aplicar.
 *
 * Não bloqueia. A sugestão vai como hookSpecificOutput.additionalContext: stdout em texto
 * puro de PostToolUse só aparece no log de debug, não chega ao Claude.
 */

import { readFileSync } from 'node:fs'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path ?? ''
if (typeof filePath !== 'string' || !/supabase[\\/]migrations[\\/].+\.sql$/i.test(filePath)) process.exit(0)

const msg = [
  'saas-shield-br: você editou uma migration.',
  `Antes de aplicar, rode /check-rls ${filePath} (ou a skill rls-reviewer).`,
  'Aplicar é local: supabase db reset + supabase test db. db push no remoto só depois do merge e com autorização explícita.',
].join('\n')

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg },
}))
process.exit(0)
