#!/usr/bin/env node
/**
 * scripts/validate.mjs
 *
 * Valida a estrutura do marketplace + plugins. Roda no CI (.github/workflows/validate.yml)
 * e também pode ser rodado localmente antes de push:
 *
 *   node scripts/validate.mjs
 *
 * Verifica:
 *   1. marketplace.json é JSON válido + tem campos obrigatórios
 *   2. Cada plugin.json é JSON válido + tem campos obrigatórios
 *   3. Cada SKILL.md tem frontmatter YAML com `name:` e `description:`
 *   4. Cada agent .md tem frontmatter com `name:` e `description:`
 *   5. Cada command .md tem frontmatter com `description:`
 *   6. Cada hook script .mjs passa em `node --check`
 *   7. Hooks.json (se existir) é JSON válido
 *
 * Saída:
 *   - exit 0 → tudo OK
 *   - exit 1 → erros encontrados (lista detalhada no stdout)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

const errors = []
const warnings = []

function err(msg) { errors.push(msg) }
function warn(msg) { warnings.push(msg) }
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function step(msg) { console.log(`\n\x1b[36m→\x1b[0m ${msg}`) }

// ─── Helpers ──────────────────────────────────────────────────────────

function walk(dir, ext = null) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      out.push(...walk(full, ext))
    } else if (!ext || full.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

function rel(p) {
  return relative(REPO_ROOT, p).replace(/\\/g, '/')
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

function validateJson(path, requiredFields = []) {
  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (e) {
    err(`${rel(path)}: JSON inválido — ${e.message}`)
    return null
  }
  for (const field of requiredFields) {
    if (!(field in data)) {
      err(`${rel(path)}: campo obrigatório ausente — \`${field}\``)
    }
  }
  return data
}

// ─── 1. marketplace.json ─────────────────────────────────────────────

step('Validando marketplace.json')

const mpPath = join(REPO_ROOT, '.claude-plugin', 'marketplace.json')
if (!existsSync(mpPath)) {
  err('.claude-plugin/marketplace.json não existe na raiz')
} else {
  const mp = validateJson(mpPath, ['name', 'plugins'])
  if (mp && Array.isArray(mp.plugins)) {
    ok(`marketplace "${mp.name}" com ${mp.plugins.length} plugin(s)`)
    for (const p of mp.plugins) {
      if (!p.name) err(`marketplace.json: plugin sem campo \`name\``)
      if (!p.source) err(`marketplace.json: plugin "${p.name}" sem campo \`source\``)
      else {
        const sourcePath = join(REPO_ROOT, p.source)
        if (!existsSync(sourcePath)) {
          err(`marketplace.json: source "${p.source}" não existe (plugin "${p.name}")`)
        }
      }
    }
  }
}

// ─── 2. plugin.json em cada subpasta ─────────────────────────────────

step('Validando plugin.json de cada plugin')

const pluginDirs = readdirSync(REPO_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(n => !n.startsWith('.') && n !== 'scripts' && n !== 'node_modules')

if (pluginDirs.length === 0) {
  warn('Nenhum plugin encontrado na raiz')
}

for (const dir of pluginDirs) {
  const pluginJsonPath = join(REPO_ROOT, dir, '.claude-plugin', 'plugin.json')
  if (!existsSync(pluginJsonPath)) {
    warn(`${dir}/: sem .claude-plugin/plugin.json — não é um plugin válido?`)
    continue
  }
  const data = validateJson(pluginJsonPath, ['name', 'version', 'description'])
  if (data) ok(`${dir}/ → "${data.name}" v${data.version}`)
}

// ─── 3. SKILL.md de cada skill ───────────────────────────────────────

step('Validando SKILL.md (frontmatter)')

for (const dir of pluginDirs) {
  const skillsDir = join(REPO_ROOT, dir, 'skills')
  if (!existsSync(skillsDir)) continue

  const skillFolders = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const skill of skillFolders) {
    const skillPath = join(skillsDir, skill, 'SKILL.md')
    if (!existsSync(skillPath)) {
      err(`${dir}/skills/${skill}/SKILL.md ausente`)
      continue
    }
    const content = readFileSync(skillPath, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      err(`${rel(skillPath)}: sem frontmatter YAML (---)`)
      continue
    }
    if (!fm.name) err(`${rel(skillPath)}: frontmatter sem \`name\``)
    if (!fm.description) err(`${rel(skillPath)}: frontmatter sem \`description\``)
    if (fm.name && fm.name !== skill) {
      warn(`${rel(skillPath)}: frontmatter \`name: ${fm.name}\` difere da pasta "${skill}"`)
    }
    if (fm.name && fm.description) ok(`${dir}/skills/${skill}/`)
  }
}

// ─── 4. agents/*.md ──────────────────────────────────────────────────

step('Validando agents/*.md')

for (const dir of pluginDirs) {
  const agentsDir = join(REPO_ROOT, dir, 'agents')
  if (!existsSync(agentsDir)) continue

  for (const file of readdirSync(agentsDir).filter(f => f.endsWith('.md'))) {
    const path = join(agentsDir, file)
    const content = readFileSync(path, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      err(`${rel(path)}: sem frontmatter YAML`)
      continue
    }
    if (!fm.name) err(`${rel(path)}: frontmatter sem \`name\``)
    if (!fm.description) err(`${rel(path)}: frontmatter sem \`description\``)
    if (fm.name && fm.description) ok(`${dir}/agents/${file}`)
  }
}

// ─── 5. commands/*.md ────────────────────────────────────────────────

step('Validando commands/*.md')

for (const dir of pluginDirs) {
  const cmdsDir = join(REPO_ROOT, dir, 'commands')
  if (!existsSync(cmdsDir)) continue

  for (const file of readdirSync(cmdsDir).filter(f => f.endsWith('.md'))) {
    const path = join(cmdsDir, file)
    const content = readFileSync(path, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      err(`${rel(path)}: sem frontmatter YAML`)
      continue
    }
    if (!fm.description) err(`${rel(path)}: frontmatter sem \`description\``)
    if (fm.description) ok(`${dir}/commands/${file}`)
  }
}

// ─── 6. hooks/hooks.json + hooks/scripts/*.mjs ───────────────────────

step('Validando hooks')

for (const dir of pluginDirs) {
  const hooksDir = join(REPO_ROOT, dir, 'hooks')
  if (!existsSync(hooksDir)) continue

  // hooks.json
  const hooksJson = join(hooksDir, 'hooks.json')
  if (existsSync(hooksJson)) {
    const data = validateJson(hooksJson)
    if (data) ok(`${dir}/hooks/hooks.json`)
  }

  // .mjs syntax check
  const scriptsDir = join(hooksDir, 'scripts')
  if (existsSync(scriptsDir)) {
    for (const file of readdirSync(scriptsDir).filter(f => f.endsWith('.mjs') || f.endsWith('.js'))) {
      const path = join(scriptsDir, file)
      try {
        execSync(`node --check "${path}"`, { stdio: 'pipe' })
        ok(`${dir}/hooks/scripts/${file} (syntax OK)`)
      } catch (e) {
        err(`${rel(path)}: erro de sintaxe Node — ${e.stderr?.toString().trim() || e.message}`)
      }
    }
  }
}

// ─── Resumo ──────────────────────────────────────────────────────────

console.log('')
console.log('═'.repeat(60))

if (warnings.length > 0) {
  console.log(`\n\x1b[33m⚠ ${warnings.length} warning(s):\x1b[0m`)
  for (const w of warnings) console.log(`  - ${w}`)
}

if (errors.length === 0) {
  console.log(`\n\x1b[32m✅ Tudo OK\x1b[0m (${warnings.length} warnings)`)
  process.exit(0)
} else {
  console.log(`\n\x1b[31m❌ ${errors.length} erro(s):\x1b[0m`)
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
