#!/usr/bin/env node
/**
 * deps-audit.mjs — auditoria de dependências que EXECUTA (não é leitura do package.json).
 *
 *   node deps-audit.mjs [--root .] [--json] [--report arquivo.json] [--no-audit]
 *                       [--exceptions docs/security/exceptions.json] [--today AAAA-MM-DD]
 *
 * Para cada pasta com lockfile (monorepo incluso):
 *   1. Lockfiles: mais de um na mesma pasta (package-lock + pnpm-lock + bun.lock + bun.lockb + yarn.lock) = P1.
 *   2. Audit do gerenciador, duas vezes (só produção e completo), para separar prod de dev:
 *        npm  npm audit --json --package-lock-only [--omit=dev]
 *        pnpm pnpm audit --json [--prod]
 *        bun  bun audit --json [--production]
 *        yarn não automatizado: fica INCONCLUSIVO com o comando para rodar à mão.
 *   3. Watchlist (watchlist.json): versões mínimas dos pacotes dos incidentes de out/2026, com a
 *      correção certa (overrides para transitiva, CDN para pacote abandonado, major = decisão do usuário).
 *      Funciona sem rede. Lista com reviewed_at vencido gera aviso.
 *   4. Runtime: engines.node, .nvmrc, .node-version, .tool-versions, volta, node-version dos
 *      workflows e FROM node: dos Dockerfiles contra o calendário de fim de vida do Node e contra o
 *      maior engines.node exigido pelas dependências instaladas.
 *
 * Severidade: P0/P1 bloqueiam (exit 1) salvo exceção válida em docs/security/exceptions.json
 * ({ "exceptions": [{ "id", "package"?, "reason", "mitigation", "owner", "expires" }] }).
 * Sem lockfile, sem o gerenciador instalado, sem rede ou yarn: INCONCLUSIVO (exit 2). Nunca PASS.
 * exit 0 = PASS ou PASS_WITH_WARNINGS.
 *
 * Sem dependências; Node LTS com suporte (22+). Copiado sem mudança para scripts/security/ dos projetos.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'yarn.lock']
const MANAGER = { 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'bun.lock': 'bun', 'bun.lockb': 'bun', 'yarn.lock': 'yarn' }
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.vercel', 'coverage', 'out', '.output', '.cache', '.expo', 'Pods', '.svelte-kit', '.nuxt'])
// Roda no build (Vercel/CI) com os segredos do ambiente: para cadeia de suprimentos, conta como produção.
const BUILD_TIME = /^(vite|@vitejs\/.*|esbuild|rollup|rolldown|@rollup\/.*|webpack|@babel\/.*|babel-.*|postcss.*|tailwindcss|@tailwindcss\/.*|next|@next\/.*|sass|turbo|@swc\/.*|terser|lightningcss|tsup|@sentry\/(webpack|vite|nextjs).*)$/
const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }
const BLOCKING = new Set(['P0', 'P1'])

// Fim de vida do Node por major (https://github.com/nodejs/Release). Ímpares não são LTS.
export const NODE_EOL = { 14: '2023-04-30', 16: '2023-09-11', 18: '2025-04-30', 19: '2023-06-01', 20: '2026-04-30', 21: '2024-06-01', 22: '2027-04-30', 23: '2025-06-01', 24: '2028-04-30', 25: '2026-06-01', 26: '2029-04-30', 27: '2027-06-01' }
const LTS_CODENAMES = { argon: 4, boron: 6, carbon: 8, dubnium: 10, erbium: 12, fermium: 14, gallium: 16, hydrogen: 18, iron: 20, jod: 22, krypton: 24 }

export class Inconclusive extends Error {}

// ─── semver mínimo (sem dependência) ───────────────────────────────────────

export function parseVersion(v) {
  const m = /^\s*[v=]?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?/.exec(String(v ?? ''))
  if (!m) return null
  const n = (s) => (s === undefined || /[xX*]/.test(s) ? null : Number(s))
  return { major: Number(m[1]), minor: n(m[2]), patch: n(m[3]), pre: m[4] ?? null }
}

/** a < b → negativo. null em minor/patch conta como 0. Pré-release vem antes da versão final. */
export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a
  const y = typeof b === 'string' ? parseVersion(b) : b
  if (!x || !y) return 0
  for (const k of ['major', 'minor', 'patch']) {
    const d = (x[k] ?? 0) - (y[k] ?? 0)
    if (d) return d
  }
  if (x.pre && !y.pre) return -1
  if (!x.pre && y.pre) return 1
  return x.pre && y.pre ? (x.pre < y.pre ? -1 : x.pre > y.pre ? 1 : 0) : 0
}

/** Menor versão aceita por um range de engines ("^20.19.0 || >=22.12.0" → 20.19.0). null se indeterminável. */
export function rangeLowerBound(range) {
  const alts = String(range ?? '').split('||').map((s) => s.trim())
  let best = null
  for (const alt of alts) {
    if (alt === '' || alt === '*' || /^x$/i.test(alt)) { best = parseVersion('0.0.0'); break }
    const hyphen = /^(\S+)\s+-\s+\S+$/.exec(alt)
    let low = null
    const comparators = hyphen ? [hyphen[1]] : alt.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/)
    for (const c of comparators) {
      const m = /^(>=|>|\^|~|=)?\s*(.+)$/.exec(c)
      if (!m || c.startsWith('<')) continue
      const v = parseVersion(m[2])
      if (v && (!low || compareVersions(v, low) > 0)) low = v
    }
    if (!low) low = parseVersion('0.0.0')
    if (!best || compareVersions(low, best) < 0) best = low
  }
  return best
}

const fmt = (v) => (v ? `${v.major}.${v.minor ?? 0}.${v.patch ?? 0}` : '?')

// ─── descoberta ─────────────────────────────────────────────────────────────

export function findPackageDirs(root, depth = 0, out = []) {
  if (depth > 6) return out
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return out }
  if (entries.some((e) => e.isFile() && e.name === 'package.json')) out.push(root)
  for (const e of entries) if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) findPackageDirs(join(root, e.name), depth + 1, out)
  return out
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

// ─── leitura de lockfile: Map nome → [{ version, source, dev, engines }] ───

function addPkg(map, name, info) {
  if (!name) return
  if (!map.has(name)) map.set(name, [])
  const list = map.get(name)
  if (!list.some((x) => x.version === info.version && x.source === info.source)) list.push(info)
}

export function readNpmLock(text) {
  const lock = JSON.parse(text)
  const map = new Map()
  if (lock.packages) {
    for (const [path, p] of Object.entries(lock.packages)) {
      if (!path) continue
      const name = p.name ?? path.slice(path.lastIndexOf('node_modules/') + 13)
      addPkg(map, name, { version: p.version, source: p.resolved ?? '', dev: !!(p.dev || p.devOptional), engines: p.engines?.node ?? (typeof p.engines === 'string' ? p.engines : undefined) })
    }
  } else if (lock.dependencies) {
    const walk = (deps) => {
      for (const [name, p] of Object.entries(deps ?? {})) {
        addPkg(map, name, { version: p.version, source: p.resolved ?? '', dev: !!p.dev })
        walk(p.dependencies)
      }
    }
    walk(lock.dependencies)
  }
  return map
}

export function readPnpmLock(text) {
  const map = new Map()
  const lines = text.split(/\r?\n/)
  let section = null
  let current = null
  const devDirect = new Set()
  const prodDirect = new Set()
  let importerGroup = null
  for (const line of lines) {
    if (/^\S/.test(line)) { section = line.replace(/:.*$/, ''); current = null; continue }
    if (section === 'importers') {
      const g = /^ {4}(dependencies|devDependencies|optionalDependencies):/.exec(line)
      if (g) { importerGroup = g[1]; continue }
      const d = /^ {6}'?([^':\s][^':]*)'?:\s*$/.exec(line)
      if (d && importerGroup) (importerGroup === 'devDependencies' ? devDirect : prodDirect).add(d[1])
      continue
    }
    if (section !== 'packages') continue
    const head = /^ {2}'?\/?((?:@[^/@\s']+\/)?[^/@\s']+)@(https?:\/\/[^'\s]+)'?:\s*$/.exec(line) ??
      /^ {2}'?\/?((?:@[^/@\s']+\/)?[^/@\s']+)[@/]([^('":\s]+)(?:\([^)]*\))*'?:\s*$/.exec(line)
    if (head) {
      current = { name: head[1], version: head[2], source: /^https?:/.test(head[2]) ? head[2] : '', dev: undefined, engines: undefined }
      addPkg(map, current.name, current)
      continue
    }
    if (!current) continue
    const dev = /^ {4}dev:\s*(true|false)/.exec(line)
    if (dev) current.dev = dev[1] === 'true'
    const eng = /^ {4}engines:\s*\{\s*node:\s*'?([^'}]+?)'?\s*[,}]/.exec(line)
    if (eng) current.engines = eng[1]
    const tar = /^ {4}resolution:\s*\{.*tarball:\s*'?([^'},]+)/.exec(line)
    if (tar) current.source = tar[1]
  }
  for (const [name, list] of map) for (const p of list) {
    if (p.dev !== undefined) continue
    if (prodDirect.has(name)) p.dev = false
    else if (devDirect.has(name)) p.dev = true
  }
  return map
}

export function readBunLock(text) {
  const lock = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'))
  const map = new Map()
  const byName = new Map()
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
    const spec = entry[0]
    const at = spec.lastIndexOf('@')
    const name = at > 0 ? spec.slice(0, at) : spec
    const version = at > 0 ? spec.slice(at + 1) : ''
    const meta = entry.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {}
    const info = { version, source: /^https?:/.test(version) ? version : (typeof entry[1] === 'string' ? entry[1] : ''), dev: undefined, engines: meta.engines?.node, deps: { ...meta.dependencies, ...meta.optionalDependencies, ...meta.peerDependencies } }
    addPkg(map, name, info)
    if (!key.includes('/') || key.startsWith('@') && key.split('/').length === 2) byName.set(name, info)
  }
  // prod = alcançável a partir das dependências de produção dos workspaces
  const prod = new Set()
  const queue = []
  for (const ws of Object.values(lock.workspaces ?? {})) for (const n of Object.keys({ ...ws.dependencies, ...ws.optionalDependencies, ...ws.peerDependencies })) queue.push(n)
  while (queue.length) {
    const n = queue.pop()
    if (prod.has(n)) continue
    prod.add(n)
    for (const d of Object.keys(byName.get(n)?.deps ?? {})) queue.push(d)
  }
  for (const [name, list] of map) for (const p of list) { p.dev = !prod.has(name); delete p.deps }
  return map
}

export function readYarnLock(text) {
  const map = new Map()
  let names = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line) && line.trim().endsWith(':') && !line.startsWith('#') && !line.startsWith('__metadata')) {
      names = line.slice(0, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).map((s) => s.slice(0, s.indexOf('@', 1)))
      continue
    }
    const v = /^ {2}version:?\s+"?([^"\s]+)"?/.exec(line)
    if (v) for (const n of names) addPkg(map, n, { version: v[1], source: '', dev: undefined })
    const r = /^ {2}resolved:?\s+"?([^"\s]+)"?/.exec(line)
    if (r) for (const n of names) { const list = map.get(n); if (list?.length) list.at(-1).source = r[1] }
  }
  return map
}

export function readLock(dir, file) {
  const path = join(dir, file)
  if (file === 'bun.lockb') return null // binário: só o bun lê
  const text = readFileSync(path, 'utf8')
  if (file === 'pnpm-lock.yaml') return readPnpmLock(text)
  if (file === 'bun.lock') return readBunLock(text)
  if (file === 'yarn.lock') return readYarnLock(text)
  return readNpmLock(text)
}

// ─── audit do gerenciador ───────────────────────────────────────────────────

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180_000, windowsHide: true, shell: process.platform === 'win32' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error }
}

function parseJsonOutput(out) {
  const s = out.trim()
  const i = s.indexOf('{')
  if (i < 0) return null
  try { return JSON.parse(s.slice(i)) } catch { return null }
}

const ghsa = (url) => /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(url ?? '')?.[0] ?? null

/** npm audit v2 → [{ package, severity, ids[], title, range, direct, fix }] */
export function parseNpmAudit(json) {
  if (!json?.vulnerabilities) return null
  const out = []
  for (const [name, v] of Object.entries(json.vulnerabilities)) {
    const via = (v.via ?? []).filter((x) => typeof x === 'object')
    const fix = v.fixAvailable === true ? { kind: 'in-range' }
      : v.fixAvailable && typeof v.fixAvailable === 'object' ? { kind: v.fixAvailable.isSemVerMajor ? 'major' : 'update', name: v.fixAvailable.name, version: v.fixAvailable.version }
        : { kind: 'none' }
    out.push({
      package: name, severity: v.severity, direct: !!v.isDirect, fix,
      ids: [...new Set(via.map((x) => ghsa(x.url)).filter(Boolean))],
      title: via[0]?.title ?? (v.via?.filter((x) => typeof x === 'string').length ? `via ${v.via.filter((x) => typeof x === 'string').join(', ')}` : ''),
      range: v.range ?? '',
    })
  }
  return out
}

/** pnpm audit (formato npm v6: advisories) → mesmo formato */
export function parsePnpmAudit(json) {
  if (!json?.advisories) return null
  const out = []
  for (const a of Object.values(json.advisories)) {
    const paths = (a.findings ?? []).flatMap((f) => f.paths ?? [])
    out.push({
      package: a.module_name, severity: a.severity, direct: paths.some((p) => p.split('>').length === 2),
      fix: { kind: a.patched_versions && a.patched_versions !== '<0.0.0' ? 'patched' : 'none', patched: a.patched_versions },
      ids: [a.github_advisory_id ?? ghsa(a.url)].filter(Boolean), title: a.title ?? '', range: a.vulnerable_versions ?? '',
      versions: [...new Set((a.findings ?? []).map((f) => f.version))],
    })
  }
  return out
}

/** bun audit --json → { pacote: [advisories] } → mesmo formato */
export function parseBunAudit(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const out = []
  for (const [name, list] of Object.entries(json)) {
    if (!Array.isArray(list)) continue
    for (const a of list) out.push({ package: name, severity: a.severity, direct: undefined, fix: { kind: 'unknown' }, ids: [ghsa(a.url)].filter(Boolean), title: a.title ?? '', range: a.vulnerable_versions ?? '' })
  }
  return out
}

function auditUnit(dir, manager) {
  const plans = {
    npm: { cmd: 'npm', full: ['audit', '--json', '--package-lock-only'], prod: ['audit', '--json', '--package-lock-only', '--omit=dev'], parse: parseNpmAudit },
    pnpm: { cmd: 'pnpm', full: ['audit', '--json'], prod: ['audit', '--json', '--prod'], parse: parsePnpmAudit },
    bun: { cmd: 'bun', full: ['audit', '--json'], prod: ['audit', '--json', '--production'], parse: parseBunAudit },
  }
  const plan = plans[manager]
  if (!plan) throw new Inconclusive(`${manager}: audit não automatizado. Rode à mão: ${manager === 'yarn' ? 'yarn npm audit --environment production (berry) ou yarn audit --groups dependencies (v1)' : `${manager} audit`}`)
  const exec = (args) => {
    const r = run(plan.cmd, args, dir)
    if (r.error) throw new Inconclusive(`${plan.cmd} não encontrado no PATH (${r.error.code ?? r.error.message})`)
    const parsed = plan.parse(parseJsonOutput(r.stdout))
    if (!parsed) {
      const err = `${r.stderr}${r.stdout}`.trim().split('\n').slice(-2).join(' ').slice(0, 300)
      if (/edgesOut/.test(err)) throw new Inconclusive(`bug do npm 10.9.x ("edgesOut"): rode com npx -y npm@11 ${args.join(' ')}`)
      throw new Inconclusive(`${plan.cmd} ${args.join(' ')} não devolveu JSON válido (sem rede? lockfile desatualizado?): ${err}`)
    }
    return parsed
  }
  const prodNames = new Set(exec(plan.prod).map((a) => a.package))
  return groupByPackage(exec(plan.full)).map((a) => ({ ...a, prod: prodNames.has(a.package) }))
}

const RANK = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }

/** pnpm e bun devolvem um item por advisory: junta por pacote (maior severidade, todos os ids). */
export function groupByPackage(list) {
  const by = new Map()
  for (const a of list) {
    const g = by.get(a.package)
    if (!g) { by.set(a.package, { ...a, ids: [...a.ids], count: 1 }); continue }
    g.count++
    for (const id of a.ids) if (!g.ids.includes(id)) g.ids.push(id)
    if ((RANK[a.severity] ?? 0) > (RANK[g.severity] ?? 0)) { g.severity = a.severity; g.title = a.title; g.range = a.range; g.fix = a.fix }
    g.direct = g.direct || a.direct
    g.versions = [...new Set([...(g.versions ?? []), ...(a.versions ?? [])])]
  }
  return [...by.values()].map((g) => (g.count > 1 ? { ...g, title: `${g.title} (+${g.count - 1} advisor${g.count > 2 ? 'ies' : 'y'})` } : g))
}

// ─── watchlist ──────────────────────────────────────────────────────────────

export function loadWatchlist(file = join(HERE, 'watchlist.json')) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Avalia uma versão contra uma regra da watchlist. null = ok; senão { reason, needsMajor }. */
export function checkWatch(rule, version, source = '') {
  if (rule.source_must_start) {
    return source.startsWith(rule.source_must_start) || String(version).startsWith(rule.source_must_start)
      ? null : { reason: `instalado de ${source ? new URL(source, 'https://x').host || source : 'registry do npm'}, não de ${rule.source_must_start}`, needsMajor: false }
  }
  const v = parseVersion(version)
  if (!v) return null
  if (rule.affected_majors && !rule.affected_majors.includes(v.major)) return null
  if (rule.min_major && v.major < rule.min_major) return { reason: `${version}: correção só na major ${rule.min_major}+`, needsMajor: true }
  if (rule.fixed) {
    const majors = Object.keys(rule.fixed).map(Number).sort((a, b) => a - b)
    const fixed = rule.fixed[String(v.major)]
    if (fixed) return compareVersions(v, fixed) < 0 ? { reason: `${version} < ${fixed}`, needsMajor: false } : null
    if (v.major < majors[0]) return { reason: `${version}: linha ${v.major} sem versão corrigida conhecida (corrigido em ${majors.map((m) => rule.fixed[m]).join(' / ')})`, needsMajor: true }
    return null
  }
  if (rule.fixed_any) {
    if (compareVersions(v, rule.fixed_any) >= 0) return null
    const target = parseVersion(rule.fixed_any)
    const needsMajor = target.major > 0 ? v.major < target.major : v.minor < target.minor
    return { reason: `${version} < ${rule.fixed_any}`, needsMajor }
  }
  return null
}

function watchFindings(pkgs, watchlist) {
  const out = []
  for (const rule of watchlist.packages) {
    const installed = pkgs.get(rule.name)
    if (!installed?.length) continue
    if (rule.only_if_any && !rule.only_if_any.some((n) => pkgs.has(n))) continue
    for (const p of installed) {
      const bad = checkWatch(rule, p.version, p.source)
      if (!bad) continue
      out.push({
        kind: 'watchlist', id: `watchlist:${rule.name}`, package: rule.name, version: p.version,
        severity: rule.severity, env: p.dev === true ? 'dev' : p.dev === false ? 'prod' : 'prod?',
        title: rule.issue, detail: bad.reason,
        fix: bad.needsMajor ? `MAJOR — decisão do usuário: entregue o plano de migração e espere aprovação. ${rule.hint}` : rule.hint,
        needsMajor: bad.needsMajor,
      })
    }
  }
  return out
}

// ─── runtime ────────────────────────────────────────────────────────────────

/** "22" → 22.∞ (a linha mais nova), "22.11.0" → exata, "lts/jod" → 22.∞. */
export function parseDeclaredNode(value) {
  const s = String(value ?? '').trim().replace(/^v/, '')
  const code = /^lts\/([a-z]+)$/i.exec(s)
  if (code && LTS_CODENAMES[code[1].toLowerCase()]) return { major: LTS_CODENAMES[code[1].toLowerCase()], minor: Infinity, patch: Infinity }
  const v = parseVersion(s)
  if (!v) return null
  return { major: v.major, minor: v.minor ?? Infinity, patch: v.minor == null ? Infinity : (v.patch ?? Infinity) }
}

export function declaredRuntimes(root, dirs) {
  const out = []
  const add = (source, value, kind) => { const v = parseDeclaredNode(value); if (v) out.push({ source, value: String(value).trim(), kind, v }) }
  for (const dir of dirs) {
    const rel = relative(root, dir) || '.'
    const pkg = readJson(join(dir, 'package.json'))
    if (pkg?.engines?.node) {
      const low = rangeLowerBound(pkg.engines.node)
      if (low) out.push({ source: `${rel}/package.json engines.node`, value: pkg.engines.node, kind: 'engines', v: low })
    }
    if (pkg?.volta?.node) add(`${rel}/package.json volta.node`, pkg.volta.node, 'pin')
    for (const f of ['.nvmrc', '.node-version']) if (existsSync(join(dir, f))) add(`${rel}/${f}`, readFileSync(join(dir, f), 'utf8').split('\n')[0], 'pin')
    if (existsSync(join(dir, '.tool-versions'))) {
      const m = /^(?:nodejs|node)\s+(\S+)/m.exec(readFileSync(join(dir, '.tool-versions'), 'utf8'))
      if (m) add(`${rel}/.tool-versions`, m[1], 'pin')
    }
    for (const f of readdirSafe(dir).filter((n) => /^Dockerfile/i.test(n))) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(?:docker\.io\/)?(?:library\/)?node:(\d+(?:\.\d+){0,2})/gim)) add(`${rel}/${f}`, m[1], 'pin')
    }
  }
  const wf = join(root, '.github', 'workflows')
  for (const f of readdirSafe(wf).filter((n) => /\.ya?ml$/.test(n))) {
    const text = readFileSync(join(wf, f), 'utf8')
    for (const m of text.matchAll(/node-version:\s*(.+)/g)) {
      if (m[1].includes('${{')) continue
      for (const n of m[1].matchAll(/\d+(?:\.(?:\d+|x)){0,2}/g)) add(`.github/workflows/${f}`, n[0], 'pin')
    }
  }
  return out
}

function readdirSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}

function runtimeFindings(declared, pkgsByUnit, today) {
  const out = []
  if (!declared.length) {
    out.push({ kind: 'runtime', id: 'runtime-nao-declarado', severity: 'P3', title: 'Versão do Node não declarada', detail: 'nenhum engines.node, .nvmrc, .node-version ou node-version de CI', fix: 'Declare engines.node no package.json (a Vercel usa) e um .nvmrc com a mesma LTS.' })
    return out
  }
  for (const d of declared) {
    const eol = NODE_EOL[d.v.major]
    if (!eol) continue
    const days = Math.round((Date.parse(eol) - Date.parse(today)) / 86_400_000)
    const what = d.kind === 'engines' ? `aceita Node ${d.v.major} (${d.value})` : `Node ${d.value}`
    if (days <= 0) out.push({ kind: 'runtime', id: `node-eol:${d.source}`, severity: d.kind === 'engines' ? 'P3' : 'P1', title: `Node ${d.v.major} em fim de vida desde ${eol}`, detail: `${d.source}: ${what}`, fix: d.kind === 'engines' ? 'Suba o piso do engines.node para uma LTS com suporte (ex.: ">=22").' : 'Suba para uma LTS com suporte (22 ou 24) em todos os lugares: engines, .nvmrc, CI, Dockerfile e Vercel (Project Settings → Node.js Version).' })
    else if (d.v.major % 2 === 1) out.push({ kind: 'runtime', id: `node-nao-lts:${d.source}`, severity: 'P2', title: `Node ${d.v.major} não é LTS (fim de vida ${eol})`, detail: `${d.source}: ${what}`, fix: 'Use uma linha LTS (par).' })
    else if (days <= 90) out.push({ kind: 'runtime', id: `node-eol-proximo:${d.source}`, severity: 'P3', title: `Node ${d.v.major} chega ao fim de vida em ${eol} (${days} dias)`, detail: `${d.source}: ${what}`, fix: 'Planeje a troca de LTS.' })
  }
  const pins = declared.filter((d) => d.kind === 'pin')
  const majors = [...new Set(pins.map((d) => d.v.major))]
  if (majors.length > 1) out.push({ kind: 'runtime', id: 'runtime-divergente', severity: 'P2', title: 'Versões de Node diferentes entre arquivos', detail: pins.map((d) => `${d.source}=${d.value}`).join(', '), fix: 'Use a mesma LTS no .nvmrc, no CI (node-version-file: .nvmrc), no Dockerfile e na Vercel.' })
  // a dependência mais exigente
  let need = null
  for (const pkgs of pkgsByUnit) for (const [name, list] of pkgs) for (const p of list) {
    if (!p.engines) continue
    const low = rangeLowerBound(p.engines)
    if (low && low.major < 100 && (!need || compareVersions(low, need.v) > 0)) need = { v: low, name, range: p.engines }
  }
  if (need) {
    for (const d of declared) {
      if (compareVersions(d.v, need.v) >= 0) continue
      out.push({ kind: 'runtime', id: `node-abaixo-do-exigido:${d.source}`, severity: d.kind === 'engines' ? 'P3' : 'P1', title: `${need.name} exige Node ${need.range}`, detail: `${d.source}: ${d.kind === 'engines' ? `engines aceita a partir de ${fmt(d.v)}` : `Node ${d.value}`}`, fix: d.kind === 'engines' ? `Suba o engines.node para >= ${fmt(need.v)}.` : `Use Node ≥ ${fmt(need.v)} (ou uma LTS acima) neste lugar.` })
    }
  }
  return out
}

// ─── exceções ───────────────────────────────────────────────────────────────

export function loadExceptions(file) {
  if (!file || !existsSync(file)) return []
  const data = readJson(file)
  const list = Array.isArray(data) ? data : data?.exceptions
  if (!Array.isArray(list)) throw new Inconclusive(`${file}: esperado { "exceptions": [ … ] }`)
  for (const e of list) if (!e.id || !e.reason || !e.owner || !e.expires) throw new Inconclusive(`${file}: cada exceção precisa de id, reason, owner e expires (AAAA-MM-DD)`)
  return list
}

function applyExceptions(findings, exceptions, today) {
  const extra = []
  for (const f of findings) {
    const ids = [f.id, ...(f.ids ?? [])]
    const e = exceptions.find((x) => ids.includes(x.id) && (!x.package || x.package === f.package))
    if (!e) continue
    if (e.expires < today) { extra.push({ kind: 'exception', id: `excecao-vencida:${e.id}`, severity: 'P2', title: `Exceção vencida em ${e.expires}`, detail: `${e.id}${e.package ? ` (${e.package})` : ''} — ${e.reason}`, fix: 'Corrija ou renove a exceção com nova data e mitigação.' }); continue }
    f.excepted = { until: e.expires, owner: e.owner, reason: e.reason }
  }
  return extra
}

// ─── orquestração ───────────────────────────────────────────────────────────

function severityOf(a, buildTime) {
  const s = a.severity
  if (a.prod || (a.prod === undefined)) return s === 'critical' ? 'P0' : s === 'high' ? 'P1' : s === 'moderate' ? 'P2' : 'P3'
  if ((s === 'critical' || s === 'high') && buildTime) return 'P1'
  return s === 'critical' || s === 'high' ? 'P2' : 'P3'
}

function fixText(a) {
  switch (a.fix.kind) {
    case 'in-range': return 'Correção dentro da faixa do package.json: npm update <pacote> (ou npm audit fix) e confira o lockfile.'
    case 'update': return `Atualize ${a.fix.name} para ${a.fix.version}.`
    case 'major': return `MAJOR — decisão do usuário: a correção exige ${a.fix.name}@${a.fix.version}. Entregue o plano de migração e espere aprovação.`
    case 'patched': return `Corrigido em ${a.fix.patched}. ${a.direct ? 'Atualize a dependência.' : 'Transitiva: atualize o pai ou use overrides (pnpm.overrides).'}`
    case 'none': return 'Sem versão corrigida: troque o pacote, use a fonte oficial do mantenedor (ex.: CDN) ou registre exceção com mitigação.'
    default: return 'Confira a versão corrigida no advisory; transitiva → overrides.'
  }
}

export function audit({ root = '.', runAudit = true, today = new Date().toISOString().slice(0, 10), exceptionsFile, watchlistFile } = {}) {
  root = resolve(root)
  if (!existsSync(join(root, 'package.json')) && !findPackageDirs(root).length) throw new Inconclusive(`${root}: nenhum package.json encontrado`)
  const dirs = findPackageDirs(root)
  const watchlist = loadWatchlist(watchlistFile)
  const findings = []
  const inconclusive = []
  const units = []

  const unitDirs = dirs.filter((d) => LOCKFILES.some((f) => existsSync(join(d, f))))
  const workspaceRoots = unitDirs.filter((d) => readJson(join(d, 'package.json'))?.workspaces || existsSync(join(d, 'pnpm-workspace.yaml')))
  for (const dir of dirs) {
    const rel = relative(root, dir) || '.'
    if (unitDirs.includes(dir)) continue
    if (!workspaceRoots.some((u) => dir.startsWith(u + '/') || dir.startsWith(u + '\\'))) {
      findings.push({ kind: 'lockfile', id: `sem-lockfile:${rel}`, severity: 'P2', title: 'Pacote sem lockfile', detail: `${rel}/package.json`, fix: 'Gere e versione o lockfile do gerenciador do projeto; instale no CI com npm ci / --frozen-lockfile.' })
    }
  }

  const pkgsByUnit = []
  for (const dir of unitDirs) {
    const rel = relative(root, dir) || '.'
    const locks = LOCKFILES.filter((f) => existsSync(join(dir, f)))
    const pkg = readJson(join(dir, 'package.json')) ?? {}
    const pm = /^(npm|pnpm|bun|yarn)@/.exec(pkg.packageManager ?? '')?.[1]
    if (locks.length > 1) {
      findings.push({ kind: 'lockfile', id: `lockfile-duplicado:${rel}`, severity: 'P1', title: 'Mais de um lockfile na mesma pasta', detail: `${rel}: ${locks.join(', ')}`, fix: `CI e Vercel podem instalar árvores diferentes. Fique com o do gerenciador ${pm ? `declarado (${pm})` : 'que o time usa'}, apague os outros, instale limpo (npm ci / pnpm install --frozen-lockfile / bun install --frozen-lockfile) e rode build e testes.${locks.includes('bun.lock') && locks.includes('bun.lockb') ? ' bun.lockb é o formato binário antigo: apague-o.' : ''}` })
    }
    const chosen = (pm && locks.find((f) => MANAGER[f] === pm)) || locks.find((f) => f !== 'bun.lockb') || locks[0]
    const manager = MANAGER[chosen]
    if (pm && pm !== manager) findings.push({ kind: 'lockfile', id: `package-manager-divergente:${rel}`, severity: 'P2', title: 'packageManager não bate com o lockfile', detail: `${rel}: packageManager=${pkg.packageManager}, lockfile=${chosen}`, fix: 'Alinhe o campo packageManager com o lockfile versionado.' })
    let pkgs = new Map()
    try { pkgs = readLock(dir, chosen) ?? new Map() } catch (e) { inconclusive.push(`${rel}/${chosen}: não consegui ler (${e.message})`) }
    pkgsByUnit.push(pkgs)
    units.push({ dir: rel, manager, lockfile: chosen, packages: pkgs.size })

    const watch = watchFindings(pkgs, watchlist).map((f) => ({ ...f, unit: rel }))
    let auditList = []
    if (runAudit) {
      try { auditList = auditUnit(dir, manager) } catch (e) { if (e instanceof Inconclusive) inconclusive.push(`${rel}: ${e.message}`); else throw e }
    } else inconclusive.push(`${rel}: audit do ${manager} não executado (--no-audit); só watchlist, lockfiles e runtime`)

    for (const a of auditList) {
      const w = watch.find((x) => x.package === a.package)
      const version = a.versions?.[0] ?? pkgs.get(a.package)?.[0]?.version
      const sev = severityOf(a, BUILD_TIME.test(a.package))
      findings.push({
        kind: 'audit', unit: rel, id: a.ids[0] ?? `audit:${a.package}`, ids: a.ids, package: a.package, version,
        severity: w && SEV_ORDER[w.severity] < SEV_ORDER[sev] ? w.severity : sev,
        env: a.prod === false ? (BUILD_TIME.test(a.package) ? 'dev (build)' : 'dev') : 'prod',
        title: `${a.severity}: ${a.title}`.trim(), detail: a.range ? `vulnerável: ${a.range}` : '',
        fix: w ? `${w.fix}` : fixText(a), needsMajor: a.fix.kind === 'major' || !!w?.needsMajor,
      })
      if (w) w.merged = true
    }
    for (const w of watch) if (!w.merged) findings.push(w)
  }

  findings.push(...runtimeFindings(declaredRuntimes(root, dirs), pkgsByUnit, today))

  const age = Math.round((Date.parse(today) - Date.parse(watchlist.reviewed_at)) / 86_400_000)
  if (age > (watchlist.max_age_days ?? 90)) findings.push({ kind: 'watchlist', id: 'watchlist-desatualizada', severity: 'P3', title: `Watchlist revisada há ${age} dias (${watchlist.reviewed_at})`, detail: 'versões mínimas podem estar velhas', fix: 'Atualize o saas-shield-br; o audit do gerenciador continua valendo.' })

  const exceptions = loadExceptions(exceptionsFile ?? join(root, 'docs', 'security', 'exceptions.json'))
  findings.push(...applyExceptions(findings, exceptions, today))
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || String(a.package ?? a.id).localeCompare(String(b.package ?? b.id)))

  const blocking = findings.filter((f) => BLOCKING.has(f.severity) && !f.excepted)
  const verdict = blocking.length ? 'FAIL' : inconclusive.length ? 'INCONCLUSIVE' : findings.some((f) => !f.excepted) ? 'PASS_WITH_WARNINGS' : 'PASS'
  return { root, today, verdict, units, blocking: blocking.length, findings, inconclusive, watchlist_reviewed_at: watchlist.reviewed_at }
}

export function format(r) {
  const icon = { FAIL: '🚨', INCONCLUSIVE: '❔', PASS_WITH_WARNINGS: '🟡', PASS: '✅' }[r.verdict]
  const lines = [`📦 deps-audit — ${r.root}`, `${icon} Veredito: ${r.verdict}${r.blocking ? ` (${r.blocking} bloqueante(s))` : ''}`, '']
  lines.push(`Unidades: ${r.units.map((u) => `${u.dir} (${u.manager}, ${u.lockfile}, ${u.packages} pacotes)`).join('; ') || 'nenhuma com lockfile'}`)
  const show = (title, list) => {
    if (!list.length) return
    lines.push('', title)
    for (const f of list) {
      const what = f.package ? `${f.package}${f.version ? ` ${f.version}` : ''}${f.env ? ` [${f.env}]` : ''}${f.unit && f.unit !== '.' ? ` (${f.unit})` : ''}` : f.detail
      const ids = f.ids?.length ? ` ${f.ids.slice(0, 3).join(' ')}${f.ids.length > 3 ? ` +${f.ids.length - 3}` : ''}` : ''
      lines.push(`  - [${f.severity}] ${what} — ${f.title}${f.package && f.detail ? ` (${f.detail})` : ''}${ids}`)
      if (!f.package && f.detail && f.detail !== what) lines.push(`      ${f.detail}`)
      lines.push(`      Como corrigir: ${f.fix}`)
    }
  }
  show('🚨 Bloqueantes (P0/P1)', r.findings.filter((f) => BLOCKING.has(f.severity) && !f.excepted))
  show('🟡 Atenção (P2/P3)', r.findings.filter((f) => !BLOCKING.has(f.severity) && !f.excepted))
  const exc = r.findings.filter((f) => f.excepted)
  if (exc.length) { lines.push('', '🔁 Com exceção válida'); for (const f of exc) lines.push(`  - ${f.package ?? f.id} ${f.id} até ${f.excepted.until} (${f.excepted.owner}): ${f.excepted.reason}`) }
  if (r.inconclusive.length) { lines.push('', '❔ Não verificado (resultado não pode ser PASS)'); for (const i of r.inconclusive) lines.push(`  - ${i}`) }
  lines.push('', 'Pronto quando: 0 P0/P1 sem exceção válida; um lockfile por pasta; runtime LTS que atende o engines das dependências; este script sai com 0.')
  if (r.findings.some((f) => f.needsMajor && !f.excepted)) lines.push('Correção que exige MAJOR é decisão do usuário: entregue o plano (skill dependency-audit) e espere aprovação.')
  return lines.join('\n')
}

function main(argv) {
  const opt = { root: '.', runAudit: true, json: false, report: null, exceptionsFile: undefined, today: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') opt.root = argv[++i]
    else if (a === '--no-audit') opt.runAudit = false
    else if (a === '--json') opt.json = true
    else if (a === '--report') opt.report = argv[++i]
    else if (a === '--exceptions') opt.exceptionsFile = resolve(argv[++i])
    else if (a === '--today') opt.today = argv[++i]
    else if (a === '--ci') { /* mesmo comportamento; reservado */ }
    else throw new Inconclusive(`opção desconhecida: ${a}`)
  }
  const r = audit(opt)
  if (opt.report) writeFileSync(opt.report, JSON.stringify(r, null, 2) + '\n')
  process.stdout.write((opt.json ? JSON.stringify(r, null, 2) : format(r)) + '\n')
  return r.verdict === 'FAIL' ? 1 : r.verdict === 'INCONCLUSIVE' ? 2 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (e) {
    if (!(e instanceof Inconclusive)) throw e
    process.stdout.write(`INCONCLUSIVO: ${e.message}\n`)
    process.exit(2)
  }
}
