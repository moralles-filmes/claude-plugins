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
 *   8. O frontmatter de skills, agents e commands é YAML válido (`: ` e ` #` só entre
 *      aspas, aspas fechadas) — se não parseia, o Claude Code ignora todos os campos
 *   9. Scripts .mjs dos plugins (hooks/scripts e scripts/) passam em `node --check`
 *  10. Templates e exemplos não fixam versão vulnerável (watchlist do saas-shield-br) nem
 *      Node em fim de vida — senão todo projeto novo nasce com o problema
 *  11. Cópias do pacote scripts/security do saas-shield-br (kit do padrao-saas) idênticas à fonte,
 *      e workflows do kit idênticos aos blocos do devops-ci (saas-builder-br)
 *
 * Saída:
 *   - exit 0 → tudo OK
 *   - exit 1 → erros encontrados (lista detalhada no stdout)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

const errors = []
const warnings = []

// nomes globais (para cross-checks): skills existentes e nomes de agentes (unicidade)
const allSkillNames = new Set()
const allAgentNames = new Map() // name → arquivo
const REMOVED_AGENTS = ['tenant-leak-hunter'] // agentes aposentados que não devem mais ser referenciados

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
  let currentListKey = null
  for (const line of m[1].split(/\r?\n/)) {
    // item de lista YAML: "  - valor"
    const li = line.match(/^\s*-\s+(.*)$/)
    if (li && currentListKey) {
      fm[currentListKey].push(li[1].trim())
      continue
    }
    // chave: (valor vazio → inicia lista) OU chave: valor (escalar)
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (kv) {
      const key = kv[1]
      const val = kv[2].trim()
      if (val === '') {
        fm[key] = []
        currentListKey = key
      } else {
        fm[key] = val
        currentListKey = null
      }
      continue
    }
    currentListKey = null
  }
  return fm
}

// ─── Sintaxe YAML do frontmatter ─────────────────────────────────────
// O Claude Code descarta o frontmatter inteiro quando ele não parseia como YAML:
// o agente perde description, tools e skills sem aviso. O parseFrontmatter acima é
// tolerante demais para perceber, então aqui aceitamos só o subconjunto usado nos
// plugins (`chave: escalar`, listas `- item`, `[a, b]`, blocos `|`/`>` e mapas
// aninhados) e tratamos o resto como erro. A correção é quase sempre pôr o valor
// entre aspas simples.

const NO_PARSE = 'o YAML não parseia e o Claude Code ignora o frontmatter inteiro'

function quotedEnd(s, i) {
  const q = s[i]
  for (let j = i + 1; j < s.length; j++) {
    if (q === '"' && s[j] === '\\') { j++; continue }
    if (s[j] === q) {
      if (q === "'" && s[j + 1] === "'") { j++; continue }
      return j + 1
    }
  }
  return -1
}

function doubleQuotedProblem(inner) {
  const re = /\\(?:x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[0abt\tnvfre "/\\N_LP])|\\(.?)/g
  for (const m of inner.matchAll(re)) {
    if (m[1] !== undefined) return `escape inválido \`\\${m[1]}\` entre aspas duplas; ${NO_PARSE}. Use aspas simples`
  }
  return null
}

function plainProblem(v) {
  if (/:(\s|$)/.test(v)) return `contém \`: \` sem aspas; ${NO_PARSE}. Coloque o valor entre aspas simples`
  if (/\s#/.test(v)) return 'contém ` #` sem aspas; o YAML trata o resto como comentário e corta o valor. Coloque o valor entre aspas simples'
  return null
}

function flowSequenceProblem(v) {
  let i = 1
  for (;;) {
    while (v[i] === ' ') i++
    if (i >= v.length) return `lista \`[...]\` sem \`]\` na mesma linha; ${NO_PARSE}`
    if (v[i] === ']') break
    if (v[i] === "'" || v[i] === '"') {
      const end = quotedEnd(v, i)
      if (end < 0) return `aspas não fechadas dentro da lista \`[...]\`; ${NO_PARSE}`
      if (v[i] === '"') {
        const p = doubleQuotedProblem(v.slice(i + 1, end - 1))
        if (p) return p
      }
      i = end
    } else {
      let j = i
      while (j < v.length && v[j] !== ',' && v[j] !== ']') j++
      const item = v.slice(i, j).trim()
      if (!item) return `item vazio na lista \`[...]\`; ${NO_PARSE}`
      if (/^[&*!%@`|>#{[]/.test(item) || /^[-?:](\s|$)/.test(item) || /[{}[]/.test(item)) {
        return `item \`${item}\` usa caractere reservado do YAML. Coloque-o entre aspas simples`
      }
      if (/:(\s|$)/.test(item)) {
        return `item \`${item}\` contém \`: \` sem aspas; dentro de \`[...]\` o YAML lê isso como mapa, não como texto. Coloque o valor entre aspas simples`
      }
      const p = plainProblem(item)
      if (p) return `item \`${item}\` ${p}`
      i = j
    }
    while (v[i] === ' ') i++
    if (v[i] === ',') { i++; continue }
    if (v[i] === ']') break
    return `esperado \`,\` ou \`]\` na lista \`[...]\`, encontrado \`${v[i] ?? 'fim da linha'}\`; ${NO_PARSE}`
  }
  const rest = v.slice(i + 1)
  if (rest.trim() && !/^\s+#/.test(rest)) return `texto depois de \`]\` (\`${rest.trim()}\`); ${NO_PARSE}`
  return null
}

function yamlValueProblem(v) {
  if (v[0] === "'" || v[0] === '"') {
    const end = quotedEnd(v, 0)
    if (end < 0) return `aspas não fechadas na mesma linha; ${NO_PARSE}`
    const rest = v.slice(end)
    if (rest.trim() && !/^\s+#/.test(rest)) return `texto depois das aspas (\`${rest.trim()}\`); ${NO_PARSE}. Ponha o valor inteiro entre aspas`
    return v[0] === '"' ? doubleQuotedProblem(v.slice(1, end - 1)) : null
  }
  if (v[0] === '[') return flowSequenceProblem(v)
  if (v[0] === '#') return 'começa com `#`; o YAML lê como comentário e o valor fica vazio. Coloque o valor entre aspas simples'
  if (/^[&*!%@`|>{},\]]/.test(v) || /^[-?:](\s|$)/.test(v)) {
    return `começa com '${v[0]}', reservado no YAML (não parseia ou muda o tipo do valor). Coloque o valor entre aspas simples`
  }
  return plainProblem(v)
}

function frontmatterYamlProblems(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return []
  const problems = []
  const seen = new Set()
  let openKey = null   // chave de topo sem valor: as linhas indentadas/`- item` seguintes pertencem a ela
  let blockCol = -1    // >= 0 dentro de um bloco `|`/`>`: linhas mais indentadas que a chave são texto livre
  m[1].split(/\r?\n/).forEach((line, idx) => {
    const at = msg => problems.push(`linha ${idx + 2}: ${msg}`)
    const indent = line.match(/^[ \t]*/)[0]
    if (blockCol >= 0) {
      if (line.trim() === '' || indent.length > blockCol) return
      blockCol = -1
    }
    if (line.trim() === '' || line.trimStart().startsWith('#')) return
    if (indent.includes('\t')) return at(`tab na indentação (o YAML só aceita espaços); ${NO_PARSE}`)

    let body = line.slice(indent.length)
    const isItem = /^-(\s|$)/.test(body)
    if (isItem) {
      if (!openKey) return at(`item \`-\` sem uma chave de lista logo acima; ${NO_PARSE}`)
      body = body.slice(1).trim()
      if (!body) return
    } else if (indent && !openKey) {
      return at('linha indentada depois de um valor; o valor foi quebrado em várias linhas? Junte numa linha só (ou use aspas ou `|`)')
    }

    const kv = body.match(/^([A-Za-z_][\w.-]*):(\s.*)?$/)
    if (!kv) {
      if (isItem) {
        const p = yamlValueProblem(body)
        return p ? at(`item da lista \`${openKey}\` ${p}`) : undefined
      }
      return at(indent
        ? `linha não reconhecida dentro de \`${openKey}\``
        : `linha não reconhecida, esperado \`chave: valor\` (valor quebrado em várias linhas ou falta espaço depois de \`:\`?); ${NO_PARSE}`)
    }

    const key = kv[1]
    const value = (kv[2] || '').trim()
    if (!indent && !isItem) {
      if (seen.has(key)) at(`chave \`${key}\` repetida; parsers divergem (erro ou vale a última)`)
      seen.add(key)
      openKey = value === '' ? key : null
    }
    if (value === '') return
    if (/^[|>][1-9+-]*(\s+#.*)?$/.test(value)) { blockCol = line.indexOf(`${key}:`); return }
    const p = yamlValueProblem(value)
    if (p) at(`\`${key}\` ${p}`)
  })
  return problems
}

function checkFrontmatterYaml(path, content) {
  for (const p of frontmatterYamlProblems(content)) {
    err(`${rel(path)}: frontmatter YAML — ${p}`)
  }
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
  .filter(n => !n.startsWith('.') && n !== 'scripts' && n !== 'node_modules' && n !== 'codex')

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
    checkFrontmatterYaml(skillPath, content)
    if (!fm.name) err(`${rel(skillPath)}: frontmatter sem \`name\``)
    if (!fm.description) err(`${rel(skillPath)}: frontmatter sem \`description\``)
    if (fm.name && fm.name !== skill) {
      warn(`${rel(skillPath)}: frontmatter \`name: ${fm.name}\` difere da pasta "${skill}"`)
    }
    allSkillNames.add(skill)
    if (fm.name) allSkillNames.add(fm.name)
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
    checkFrontmatterYaml(path, content)
    if (!fm.name) err(`${rel(path)}: frontmatter sem \`name\``)
    if (!fm.description) err(`${rel(path)}: frontmatter sem \`description\``)

    // filename ↔ name
    const base = basename(file, '.md')
    if (fm.name && fm.name !== base) {
      err(`${rel(path)}: \`name: ${fm.name}\` difere do arquivo "${base}.md"`)
    }
    // nome único entre todos os agentes
    if (fm.name) {
      if (allAgentNames.has(fm.name)) {
        err(`${rel(path)}: nome de agente duplicado "${fm.name}" (já em ${allAgentNames.get(fm.name)})`)
      } else {
        allAgentNames.set(fm.name, rel(path))
      }
    }
    // tools recomendado (allowlist explícita é a barreira de segurança em plugin agents)
    if (!fm.tools) warn(`${rel(path)}: sem \`tools\` — recomende allowlist explícita`)
    // auditor de segurança (saas-shield-br) deve ser read-only
    const isAuditor = fm.name && /-(auditor|hunter|validator|reviewer)$/.test(fm.name)
    const toolsStr = Array.isArray(fm.tools) ? fm.tools.join(',') : (fm.tools || '')
    if (dir === 'saas-shield-br' && isAuditor && /\b(Write|Edit|NotebookEdit)\b/.test(toolsStr)) {
      err(`${rel(path)}: agente auditor "${fm.name}" tem ferramenta de escrita — deve ser read-only`)
    }
    // skills: pré-carregadas devem existir
    if (Array.isArray(fm.skills)) {
      for (const s of fm.skills) {
        if (!allSkillNames.has(s)) {
          err(`${rel(path)}: \`skills: ${s}\` não existe em nenhum plugin do repo`)
        }
      }
    }
    // corpo: uso legado do "Task tool" e referências a agentes removidos
    if (/\bTask tool\b/i.test(content)) {
      warn(`${rel(path)}: cita "Task tool" (legado) — use "Agent tool"`)
    }
    for (const removed of REMOVED_AGENTS) {
      if (content.includes(removed)) {
        warn(`${rel(path)}: referencia agente removido "${removed}"`)
      }
    }

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
    checkFrontmatterYaml(path, content)
    if (!fm.description) err(`${rel(path)}: frontmatter sem \`description\``)
    if (/\bTask tool\b/i.test(content)) {
      warn(`${rel(path)}: cita "Task tool" (legado) — use "Agent tool"`)
    }
    for (const removed of REMOVED_AGENTS) {
      if (content.includes(removed)) {
        warn(`${rel(path)}: referencia agente removido "${removed}"`)
      }
    }
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

// ─── 6b. scripts/**/*.mjs dos plugins ────────────────────────────────

step('Validando scripts dos plugins (node --check)')

for (const dir of pluginDirs) {
  for (const path of walk(join(REPO_ROOT, dir, 'scripts')).filter(f => /\.(mjs|js)$/.test(f))) {
    try {
      execSync(`node --check "${path}"`, { stdio: 'pipe' })
      ok(`${rel(path)} (syntax OK)`)
    } catch (e) {
      err(`${rel(path)}: erro de sintaxe Node — ${e.stderr?.toString().trim() || e.message}`)
    }
  }
}

// ─── 7. Marketplace Codex (.agents/plugins/marketplace.json) ─────────

step('Validando marketplace Codex')

const codexMpPath = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json')
if (existsSync(codexMpPath)) {
  const cmp = validateJson(codexMpPath, ['name', 'plugins'])
  if (cmp) {
    if (!/^[A-Za-z0-9_-]+$/.test(cmp.name || '')) err(`${rel(codexMpPath)}: \`name\` inválido`)
    for (const p of cmp.plugins || []) {
      const label = `${rel(codexMpPath)}: plugin "${p.name}"`
      if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(p.name || '')) err(`${label}: \`name\` inválido`)
      if (p.source?.source !== 'local' || typeof p.source?.path !== 'string') { err(`${label}: \`source\` deve ser {source:"local", path}`); continue }
      if (!['NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT'].includes(p.policy?.installation)) err(`${label}: policy.installation inválido`)
      if (!['ON_INSTALL', 'ON_USE'].includes(p.policy?.authentication)) err(`${label}: policy.authentication inválido`)
      if (!p.category) err(`${label}: \`category\` ausente`)
      const pluginRoot = join(REPO_ROOT, p.source.path)
      const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json')
      if (!existsSync(manifestPath)) { err(`${label}: ${p.source.path}/.codex-plugin/plugin.json não existe`); continue }
      const m = validateJson(manifestPath, ['name', 'version', 'description', 'author', 'interface'])
      if (!m) continue
      if (m.name !== p.name) err(`${rel(manifestPath)}: name "${m.name}" difere da entrada "${p.name}"`)
      if (!/^\d+\.\d+\.\d+([-+].*)?$/.test(m.version || '')) err(`${rel(manifestPath)}: version não é semver`)
      if ('hooks' in m) err(`${rel(manifestPath)}: campo \`hooks\` não é aceito pelo Codex`)
      for (const f of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
        if (!m.interface?.[f]) err(`${rel(manifestPath)}: interface.${f} ausente`)
      }
      if (!m.interface?.defaultPrompt && !m.interface?.default_prompt) err(`${rel(manifestPath)}: interface.defaultPrompt ausente`)
      const skillsDir = join(pluginRoot, 'skills')
      for (const s of existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()) : []) {
        const skillMd = join(skillsDir, s.name, 'SKILL.md')
        const skillContent = existsSync(skillMd) ? readFileSync(skillMd, 'utf-8') : null
        const fm = skillContent ? parseFrontmatter(skillContent) : null
        if (skillContent) checkFrontmatterYaml(skillMd, skillContent)
        if (!fm?.name || !fm?.description) err(`${p.source.path}/skills/${s.name}/SKILL.md: frontmatter precisa de name e description`)
        if (fm && fm['disable-model-invocation'] && fm['disable-model-invocation'] !== 'false') err(`${p.source.path}/skills/${s.name}: disable-model-invocation deve ser false no Codex`)
      }
      ok(`codex: ${p.source.path} → "${m.name}" v${m.version}`)
    }
  }
}

// ─── 8. ai-router-br: núcleo idêntico entre Claude e Codex ───────────

step('Validando sincronização ai-router-br (Claude ↔ Codex)')

const claudeRouter = join(REPO_ROOT, 'ai-router-br')
const codexRouter = join(REPO_ROOT, 'codex', 'ai-router-br')
if (existsSync(claudeRouter) && existsSync(codexRouter)) {
  const shared = ['lib', 'workers', 'scripts', 'tests', 'templates', 'references']
  const files = dir => shared.flatMap(s => walk(join(dir, s)).map(f => relative(dir, f).replace(/\\/g, '/')))
  const a = new Set(files(claudeRouter)), b = new Set(files(codexRouter))
  let drift = 0
  for (const f of new Set([...a, ...b])) {
    const norm = p => existsSync(p) ? readFileSync(p, 'utf-8').replace(/\r\n/g, '\n') : null
    if (norm(join(claudeRouter, f)) !== norm(join(codexRouter, f))) { err(`ai-router-br: ${f} difere entre ai-router-br/ e codex/ai-router-br/`); drift++ }
  }
  const versions = ['ai-router-br/package.json', 'ai-router-br/.claude-plugin/plugin.json', 'codex/ai-router-br/package.json', 'codex/ai-router-br/.codex-plugin/plugin.json']
    .map(f => JSON.parse(readFileSync(join(REPO_ROOT, f), 'utf-8')).version)
  if (new Set(versions).size !== 1) err(`ai-router-br: versões divergentes ${versions.join(', ')}`)
  if (!drift) ok(`núcleo compartilhado idêntico (${a.size} arquivos), versão ${versions[0]}`)
}

// ─── 9. padrao-saas: manifest e AGENTS aninhados do kit em dia ───────

step('Validando o kit do padrao-saas (manifest, @AGENTS.md, AGENTS aninhados)')

const padraoKit = join(REPO_ROOT, 'padrao-saas', 'skills', 'aplicar', 'assets', 'repo')
const padraoCheck = join(padraoKit, 'scripts', 'check-padrao.mjs')
if (existsSync(padraoCheck)) {
  try {
    execSync(`node "${padraoCheck}" --root "${padraoKit}"`, { stdio: 'pipe' })
    ok('padrao-saas: padrões batem com o manifest; supabase/AGENTS.md em dia')
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').filter(l => l.trim().startsWith('-')).join(' | ')
    err(`padrao-saas: kit desatualizado — rode check-padrao.mjs --root <kit> --write-manifest --write-nested (${out})`)
  }
}

// ─── 9b. Versões Codex geradas em dia com os plugins Claude ─────────

step('Validando versões Codex geradas (scripts/build-codex-plugins.mjs --check)')

const codexBuilder = join(REPO_ROOT, 'scripts', 'build-codex-plugins.mjs')
if (existsSync(codexBuilder)) {
  try {
    ok(execSync(`node "${codexBuilder}" --check`, { stdio: 'pipe', encoding: 'utf8' }).trim())
  } catch (e) {
    err(`${`${e.stderr ?? ''}${e.stdout ?? ''}`.trim().split('\n').slice(0, 6).join(' | ')}`)
  }
}

// ─── 9c. Templates sem versão vulnerável nem Node em fim de vida ─────
// Data-driven: as regras vêm de saas-shield-br/scripts/security/watchlist.json (a mesma do
// deps-audit). Fica de fora o que é histórico ou fixture: CHANGELOG, tests/, codex/ (gerado).

step('Validando templates (versões da watchlist e Node em fim de vida)')

const depsAudit = join(REPO_ROOT, 'saas-shield-br', 'scripts', 'security', 'deps-audit.mjs')
if (existsSync(depsAudit)) {
  const { checkWatch, loadWatchlist } = await import(pathToFileURL(depsAudit).href)
  const rules = new Map(loadWatchlist().packages.map(r => [r.name, r]))
  const NODE_EOL_PATTERNS = [
    [/node-version:\s*['"]?(1[0-9]|20)(?:\.[0-9x]+)*['"]?(?=[\s,}\]]|$)/m, 'node-version de CI em Node fim de vida'],
    [/FROM\s+node:(1[0-9]|20)\b/, 'imagem Docker com Node em fim de vida'],
    [/"node"\s*:\s*">=\s*(1[0-9]|20)(?:\.\d+)*"/, 'engines.node aceitando Node em fim de vida'],
    [/\bNode(?:\.js)?\s*(?:18|20)\+/, 'documentação pedindo Node em fim de vida'],
  ]
  const files = pluginDirs.flatMap(d => walk(join(REPO_ROOT, d)))
    .concat(walk(join(REPO_ROOT, '.github')), walk(join(REPO_ROOT, '.githooks')), [join(REPO_ROOT, 'README.md')])
    .filter(f => /\.(md|json|ya?ml|mjs|sh|ps1)$|(^|[\\/])pre-(push|commit)$/.test(f))
    .filter(f => !/[\\/](tests|node_modules)[\\/]|CHANGELOG\.md$|[\\/]scripts[\\/]security[\\/](watchlist\.json|deps-audit\.mjs)$/.test(f))
  let stale = 0
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/"((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)"\s*:\s*"[\^~>=\s]*(\d+\.\d+(?:\.\d+)?)/g)) {
        const rule = rules.get(m[1])
        const bad = rule && checkWatch(rule, m[2])
        if (bad) { err(`${rel(f)}:${i + 1}: ${m[1]} ${m[2]} vulnerável (${rule.issue}) — ${bad.reason}`); stale++ }
      }
      for (const m of line.matchAll(/\bnpm:((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@[\^~]?(\d+(?:\.\d+){0,2})/g)) {
        const rule = rules.get(m[1])
        const v = m[2].split('.').length === 1 ? `${m[2]}.0.0` : m[2]
        const bad = rule && checkWatch(rule, v)
        if (bad) { err(`${rel(f)}:${i + 1}: npm:${m[1]}@${m[2]} vulnerável (${rule.issue}) — ${bad.reason}`); stale++ }
      }
      for (const [re, msg] of NODE_EOL_PATTERNS) if (re.test(line)) { err(`${rel(f)}:${i + 1}: ${msg} — use uma LTS com suporte (22 ou 24)`); stale++ }
    })
  }
  if (!stale) ok(`${files.length} arquivos sem versão vulnerável da watchlist nem Node em fim de vida`)
}

// ─── 9d. Kit do padrao-saas: cópias do saas-shield-br idênticas ─────
// O kit grava scripts/security/ e os workflows (ci, security, auditoria, dependabot) nos projetos.
// A fonte é o saas-shield-br (scripts) e o devops-ci do saas-builder-br (workflows): cópia divergente é erro.

step('Validando cópias do kit (scripts/security, ci.yml, security.yml, auditoria.yml, dependabot.yml)')

const shieldSec = join(REPO_ROOT, 'saas-shield-br', 'scripts', 'security')
const kitRepo = join(REPO_ROOT, 'padrao-saas', 'skills', 'aplicar', 'assets', 'repo')
if (existsSync(shieldSec) && existsSync(kitRepo)) {
  const lf = f => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  let diverged = 0
  const src = readdirSync(shieldSec).filter(f => !f.startsWith('.'))
  const kit = existsSync(join(kitRepo, 'scripts', 'security')) ? readdirSync(join(kitRepo, 'scripts', 'security')) : []
  for (const f of new Set([...src, ...kit])) {
    const a = join(shieldSec, f), b = join(kitRepo, 'scripts', 'security', f)
    if (!existsSync(a) || !existsSync(b) || lf(a) !== lf(b)) { err(`padrao-saas kit: scripts/security/${f} difere de saas-shield-br/scripts/security/${f} — copie de novo`); diverged++ }
  }
  const devops = lf(join(REPO_ROOT, 'saas-builder-br', 'agents', 'devops-ci.md'))
  const blocks = [...devops.matchAll(/```yaml\n([\s\S]*?)```/g)].map(m => m[1])
  const workflows = [
    ['.github/workflows/ci.yml', b => b.startsWith('name: CI\n')],
    ['.github/workflows/security.yml', b => b.startsWith('name: security\n')],
    ['.github/workflows/auditoria.yml', b => b.startsWith('name: auditoria\n')],
    ['.github/dependabot.yml', b => b.startsWith('# .github/dependabot.yml\n')],
  ]
  for (const [file, pick] of workflows) {
    const block = blocks.find(pick)
    const path = join(kitRepo, file)
    if (!block || !existsSync(path) || lf(path) !== block) { err(`padrao-saas kit: ${file} difere do bloco correspondente em saas-builder-br/agents/devops-ci.md`); diverged++ }
  }
  if (!diverged) ok(`kit em dia com a fonte (${src.length} scripts de segurança + ${workflows.length} arquivos do GitHub)`)
}

// ─── 10. Versão do plugin.json = topo do CHANGELOG ──────────────────

step('Validando versão do plugin.json contra o CHANGELOG')

for (const dir of pluginDirs) {
  const pj = join(REPO_ROOT, dir, '.claude-plugin', 'plugin.json')
  const cl = join(REPO_ROOT, dir, 'CHANGELOG.md')
  if (!existsSync(pj) || !existsSync(cl)) continue
  let version
  try { version = JSON.parse(readFileSync(pj, 'utf8')).version } catch { continue }
  const top = readFileSync(cl, 'utf8').match(/^##\s*\[?v?(\d+\.\d+\.\d+)/m)
  if (!top) warn(`${dir}/CHANGELOG.md: nenhuma versão no formato "## x.y.z"`)
  else if (top[1] !== version) err(`${dir}: plugin.json v${version} ≠ CHANGELOG v${top[1]} (registre a versão nova no CHANGELOG)`)
  else ok(`${dir}: v${version} registrada no CHANGELOG`)
}

// ─── 11. Testes dos plugins (node:test) ─────────────────────────────
// Plugins com package.json (ai-router-br) rodam os próprios testes via npm no CI.

step('Rodando testes dos plugins (node --test)')

for (const dir of pluginDirs) {
  const testsDir = join(REPO_ROOT, dir, 'tests')
  if (!existsSync(testsDir) || existsSync(join(REPO_ROOT, dir, 'package.json'))) continue
  const files = readdirSync(testsDir).filter(f => f.endsWith('.test.mjs')).map(f => join(testsDir, f))
  if (!files.length) continue
  try {
    const out = execSync(`node --test ${files.map(f => `"${f}"`).join(' ')}`, { stdio: 'pipe', encoding: 'utf8' })
    const pass = out.match(/^# pass (\d+)/m)?.[1] ?? '?'
    ok(`${dir}: ${pass} teste(s) passaram`)
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const failed = out.split('\n').filter(l => /^\s*not ok /.test(l)).slice(0, 8).map(l => l.trim()).join(' | ')
    err(`${dir}: testes falharam — ${failed || 'rode node --test ' + dir + '/tests/*.test.mjs'}`)
  }
}

// ─── 12. SQL de referência do padrao-saas (pgTAP) ───────────────────
// Local: sem psql/servidor vira aviso. CI: job próprio roda com --required.

step('Rodando testes SQL do padrao-saas (pgTAP, dois adapters)')

const sqlRunner = join(REPO_ROOT, 'padrao-saas', 'tests', 'run-sql-tests.mjs')
if (existsSync(sqlRunner)) {
  try {
    const out = execSync(`node "${sqlRunner}"`, { stdio: 'pipe', encoding: 'utf8' })
    if (/NÃO EXECUTADO/.test(out)) warn(out.trim())
    else ok('padrao-saas: SQL de referência passou nos adapters supabase e postgres')
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').filter(l => /✗|not ok/.test(l)).slice(0, 8).join(' | ')
    err(`padrao-saas: testes SQL falharam — ${out}`)
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
