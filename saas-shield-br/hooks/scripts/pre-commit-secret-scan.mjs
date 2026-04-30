#!/usr/bin/env node
/**
 * Hook PreToolUse: ao detectar que o Claude vai rodar `git commit`,
 * faz scan rápido nos arquivos staged contra patterns críticos de secret.
 *
 * Bloqueia commit se detectar Supabase service_role JWT, Stripe live secret,
 * AWS access key, ou Anthropic/OpenAI API key.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const cmd = payload?.tool_input?.command ?? ''

// Só age em comandos `git commit`
if (!/^\s*git\s+commit\b/.test(cmd)) process.exit(0)

// Pega arquivos staged
let stagedFiles = []
try {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf-8',
  })
  stagedFiles = out.split('\n').filter(Boolean)
} catch {
  process.exit(0)
}

if (stagedFiles.length === 0) process.exit(0)

// Patterns críticos (apenas os mais perigosos — scan completo via /secret-scan)
const criticalPatterns = [
  {
    name: 'Supabase service_role JWT',
    re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/,
  },
  { name: 'Stripe live secret', re: /sk_live_[A-Za-z0-9]{24,}/ },
  { name: 'Stripe restricted live', re: /rk_live_[A-Za-z0-9]{24,}/ },
  { name: 'Stripe webhook secret', re: /whsec_[A-Za-z0-9]{32,}/ },
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Anthropic API key', re: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{90,}/ },
  { name: 'OpenAI API key', re: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/ },
  { name: 'GitHub PAT', re: /(ghp|gho|ghs)_[A-Za-z0-9]{36}/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,48}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

const findings = []

for (const file of stagedFiles) {
  // Skip binary/large
  if (/\.(png|jpg|jpeg|gif|webp|svg|pdf|zip|tar|gz|woff2?|mp4|mov)$/i.test(file)) continue

  let content = ''
  try {
    content = execSync(`git show :${file}`, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 })
  } catch {
    continue
  }

  for (const p of criticalPatterns) {
    const match = content.match(p.re)
    if (match) {
      findings.push({ file, type: p.name, snippet: match[0].slice(0, 24) + '…' })
    }
  }
}

if (findings.length === 0) process.exit(0)

const msg = [
  '🛡️ saas-shield-br bloqueou git commit',
  '',
  'Secrets detectados nos arquivos staged:',
  '',
  ...findings.map((f) => `  - ${f.file}\n    Tipo: ${f.type}\n    Match: ${f.snippet}`),
  '',
  'Ações:',
  '  1. Remova os secrets do código',
  '  2. Adicione ao .gitignore se for arquivo .env',
  '  3. ROTACIONE as chaves (mesmo após remover, elas vazaram localmente)',
  '  4. Re-stage e tente commit novamente',
  '',
  'Se quer scan completo, peça ao usuário rodar /secret-scan',
].join('\n')

process.stderr.write(msg + '\n')
process.exit(2)
