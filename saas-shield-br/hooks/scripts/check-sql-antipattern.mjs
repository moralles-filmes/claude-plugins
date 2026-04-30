#!/usr/bin/env node
/**
 * Hook PreToolUse: bloqueia Edit/Write em arquivos *.sql que contenham
 * anti-patterns RLS críticos (USING (true), SECURITY DEFINER sem search_path, etc).
 *
 * Recebe via stdin um JSON do Claude Code com:
 *   { tool_name, tool_input: { file_path, content?, new_string? } }
 *
 * Saída:
 *   - exit 0 → permite
 *   - exit 2 + stderr → bloqueia (Claude vê a mensagem)
 */

import { readFileSync } from 'node:fs'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path ?? ''

// Só age em SQL de migrations
if (!/\.(sql)$/i.test(filePath)) process.exit(0)
if (!/migrations/i.test(filePath)) process.exit(0)

const content =
  payload?.tool_input?.content ??
  payload?.tool_input?.new_string ??
  ''

if (!content) process.exit(0)

const blockers = []

// Anti-pattern #1: USING (true)
if (/\bUSING\s*\(\s*true\s*\)/i.test(content)) {
  blockers.push('🚨 Policy com USING (true) — equivale a desligar RLS')
}

// Anti-pattern #2: WITH CHECK (true)
if (/\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(content)) {
  blockers.push('🚨 Policy com WITH CHECK (true) — permite inserir em qualquer tenant')
}

// Anti-pattern #3: SECURITY DEFINER sem SET search_path
const secDefRegex = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]+?SECURITY\s+DEFINER[\s\S]+?(?=\$\$|LANGUAGE)/gi
const matches = content.match(secDefRegex) || []
for (const block of matches) {
  if (!/SET\s+search_path\s*=/i.test(block)) {
    blockers.push('🚨 Função SECURITY DEFINER sem SET search_path — vulnerável a hijack')
  }
}

// Anti-pattern #4: ENABLE RLS sem FORCE
if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(content) &&
    !/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(content)) {
  blockers.push('🚨 ENABLE ROW LEVEL SECURITY sem FORCE — donos da tabela bypassam')
}

// Warnings (não bloqueiam, só avisam)
const warnings = []
if (/CREATE\s+TABLE[\s\S]+?company_id/i.test(content)) {
  if (!/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(content)) {
    warnings.push('🟡 CREATE TABLE com company_id sem FORCE ROW LEVEL SECURITY no mesmo arquivo')
  }
  if (!/force_company_id/i.test(content)) {
    warnings.push('🟡 CREATE TABLE com company_id sem trigger force_company_id no mesmo arquivo')
  }
}

// Bloqueia se houver bloqueantes 🚨
if (blockers.length > 0) {
  const msg = [
    `🛡️ saas-shield-br bloqueou Edit/Write em ${filePath}`,
    '',
    ...blockers.map((b) => `  - ${b}`),
    ...(warnings.length ? ['', 'Avisos adicionais:', ...warnings.map((w) => `  - ${w}`)] : []),
    '',
    'Carregue a skill rls-reviewer e revise antes de salvar.',
    'Se o problema é falso-positivo, peça ao usuário aprovação explícita.',
  ].join('\n')
  process.stderr.write(msg + '\n')
  process.exit(2)
}

// Apenas avisa em warnings (PostToolUse-like context via stdout)
if (warnings.length > 0) {
  const msg = [
    `💡 saas-shield-br: avisos em ${filePath}`,
    ...warnings.map((w) => `  - ${w}`),
    '',
    'Não bloqueante — mas considere completar o setup multi-tenant em migration subsequente.',
  ].join('\n')
  process.stdout.write(msg + '\n')
}

process.exit(0)
