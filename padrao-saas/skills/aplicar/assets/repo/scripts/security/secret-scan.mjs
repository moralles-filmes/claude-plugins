#!/usr/bin/env node
/**
 * secret-scan.mjs — varredura de secrets que EXECUTA (não é análise estática do working tree).
 *
 *   node secret-scan.mjs --staged      [--repo .]   o que vai entrar no próximo commit (git pre-commit)
 *   node secret-scan.mjs --outgoing    [--repo .]   commits locais que ainda não estão em nenhum remoto (git pre-push)
 *   node secret-scan.mjs --history     [--repo .]   TODO o histórico, todas as refs
 *   node secret-scan.mjs --range A..B  [--repo .]   só um intervalo (ex.: commits de um PR no CI)
 *
 * Opções: --json (relatório em JSON), --allowlist <arquivo> (padrão: <repo>/.secret-scan-allow.json),
 *         --allow-shallow (aceita clone raso no --history; sem isso o resultado é INCONCLUSIVO).
 *
 * Padrões: secret-patterns.mjs (a mesma lista do hook do Claude Code). JWT só conta com
 * role = service_role. Arquivos .env* versionados seguem env-public.mjs.
 * Nunca imprime o valor: só commit, arquivo, linha/mudança e o id do padrão.
 *
 * Saída: exit 0 = nada encontrado; exit 1 = achado (siga o rotation-runbook.md, provedor primeiro);
 *        exit 2 = INCONCLUSIVO (não é repo git, clone raso, erro do git). Inconclusivo nunca é PASS.
 *
 * Sem dependências; Node LTS com suporte (22+). Copiado sem mudança para scripts/security/ dos projetos.
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanText } from './secret-patterns.mjs'
import { envFileProblem, isEnvFile } from './env-public.mjs'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|pdf|zip|tar|gz|tgz|bz2|xz|7z|rar|woff2?|ttf|otf|eot|mp3|mp4|mov|webm|wav|wasm|exe|dll|so|dylib|jar|class|lockb)$/i

export class Inconclusive extends Error {}

function git(repo, args, { input, allowFail = false } = {}) {
  const r = spawnSync('git', ['-C', repo, '-c', 'core.quotepath=off', ...args], {
    input, maxBuffer: 1024 * 1024 * 1024, windowsHide: true,
  })
  if (r.error || r.status !== 0) {
    if (allowFail) return null
    throw new Inconclusive(`git ${args[0]} falhou: ${(r.stderr || '').toString().trim() || r.error?.message}`)
  }
  return r.stdout
}

function ensureRepo(repo) {
  const inside = git(repo, ['rev-parse', '--is-inside-work-tree'], { allowFail: true })
  if (!inside || inside.toString().trim() !== 'true') throw new Inconclusive(`${repo} não é um repositório git`)
}

export function isShallow(repo) {
  return git(repo, ['rev-parse', '--is-shallow-repository'], { allowFail: true })?.toString().trim() === 'true'
}

// ─── allowlist ──────────────────────────────────────────────────────────────

export function loadAllowlist(file) {
  if (!file || !existsSync(file)) return []
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const list = Array.isArray(data) ? data : data.allow
  if (!Array.isArray(list)) throw new Inconclusive(`${file}: esperado { "allow": [ … ] }`)
  for (const e of list) {
    if (!e.file || !e.id || !e.reason) throw new Inconclusive(`${file}: cada item precisa de file, id e reason`)
  }
  return list
}

function allowed(list, f) {
  return list.some((e) => e.file === f.file && e.id === f.id && (!e.commit || (f.commit || '').startsWith(e.commit)))
}

// ─── staged ─────────────────────────────────────────────────────────────────

/** Blobs do índice que vão para o próximo commit. */
export function scanStaged(repo) {
  const raw = git(repo, ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMT'])
  const parts = raw.toString('utf8').split('\0')
  const entries = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].trim().split(/\s+/)
    const path = parts[i + 1]
    if (meta.length < 5 || !path) continue
    const [, mode, , sha] = meta
    if (mode === '160000' || mode === '120000' || SKIP_EXT.test(path)) continue
    entries.push({ path, sha })
  }
  const findings = []
  for (const { path, content } of readBlobs(repo, entries)) {
    for (const s of scanText(content)) findings.push({ file: path, line: s.line, id: s.id, name: s.name, change: 'staged' })
    const env = envFileProblem(path, content)
    if (env) findings.push({ file: path, line: 1, id: env.id, name: env.name, change: 'staged' })
  }
  return { findings, scanned: entries.length, unit: 'arquivo(s) staged' }
}

function readBlobs(repo, entries) {
  if (!entries.length) return []
  const info = git(repo, ['cat-file', '--batch-check'], { input: entries.map((e) => e.sha).join('\n') + '\n' }).toString('utf8').split('\n')
  const keep = entries.filter((_, i) => {
    const [, type, size] = (info[i] ?? '').split(' ')
    return type === 'blob' && Number(size) <= MAX_FILE_BYTES
  })
  if (!keep.length) return []
  const out = git(repo, ['cat-file', '--batch'], { input: keep.map((e) => e.sha).join('\n') + '\n' })
  const result = []
  let pos = 0
  for (const entry of keep) {
    const nl = out.indexOf(0x0a, pos)
    if (nl < 0) break
    const size = Number(out.subarray(pos, nl).toString('utf8').split(' ')[2])
    const content = out.subarray(nl + 1, nl + 1 + size)
    pos = nl + 1 + size + 1
    if (!content.subarray(0, 8000).includes(0)) result.push({ path: entry.path, content: content.toString('utf8') })
  }
  return result
}

// ─── histórico / intervalo / saída ──────────────────────────────────────────

/**
 * Varre as linhas adicionadas e removidas de `git log -p <revs>` e os .env* versionados nesses commits.
 * revs: ['--all'] | ['A..B'] | ['HEAD', '--not', '--remotes']
 */
export function scanLog(repo, revs) {
  const log = git(repo, ['log', '-p', '--no-color', '--no-ext-diff', '--no-textconv', '--format=commit %H', ...revs]).toString('utf8')
  const findings = []
  const seen = new Set()
  const commits = new Set()
  let commit = ''
  let file = ''
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) { commit = line.slice(7).trim(); commits.add(commit); continue }
    if (line.startsWith('--- a/')) { file = line.slice(6); continue }
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue }
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('diff --git ')) continue
    if (line[0] !== '+' && line[0] !== '-') continue
    if (SKIP_EXT.test(file)) continue
    const change = line[0] === '+' ? 'adicionado' : 'removido'
    for (const s of scanText(line.slice(1))) {
      const key = `${commit}\0${file}\0${s.id}\0${change}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ commit, file, id: s.id, name: s.name, change })
    }
  }
  // .env* que entraram ou mudaram nesses commits: o conteúdo daquele commit precisa ser só público
  const names = git(repo, ['log', '--format=commit %H', '--name-only', '--diff-filter=AM', ...revs, '--', '.env*', ':(glob)**/.env*']).toString('utf8')
  commit = ''
  for (const line of names.split('\n')) {
    if (line.startsWith('commit ')) { commit = line.slice(7).trim(); continue }
    const path = line.trim()
    if (!path || !isEnvFile(path)) continue
    const blob = git(repo, ['show', `${commit}:${path}`], { allowFail: true })
    if (!blob || blob.length > MAX_FILE_BYTES) continue
    const env = envFileProblem(path, blob.toString('utf8'))
    if (env) findings.push({ commit, file: path, id: env.id, name: env.name, change: 'versionado' })
  }
  return { findings, scanned: commits.size, unit: 'commit(s)' }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function run(argv) {
  const args = { repo: '.', mode: null, range: null, json: false, allowlist: null, allowShallow: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') args.repo = argv[++i]
    else if (a === '--staged' || a === '--history' || a === '--outgoing') args.mode = a.slice(2)
    else if (a === '--range') { args.mode = 'range'; args.range = argv[++i] }
    else if (a === '--json') args.json = true
    else if (a === '--allowlist') args.allowlist = argv[++i]
    else if (a === '--allow-shallow') args.allowShallow = true
    else throw new Inconclusive(`opção desconhecida: ${a}`)
  }
  if (!args.mode) throw new Inconclusive('escolha --staged, --outgoing, --history ou --range A..B')
  const repo = resolve(args.repo)
  ensureRepo(repo)
  const top = git(repo, ['rev-parse', '--show-toplevel']).toString('utf8').trim()
  const allowlist = loadAllowlist(args.allowlist ?? join(top, '.secret-scan-allow.json'))

  let result
  let scope
  if (args.mode === 'staged') { result = scanStaged(repo); scope = 'staged' }
  else {
    const hasHead = git(repo, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true })
    if (!hasHead) result = { findings: [], scanned: 0, unit: 'commit(s)' }
    else if (args.mode === 'history') {
      if (isShallow(repo) && !args.allowShallow) throw new Inconclusive('clone raso: o histórico não está todo aqui. Rode git fetch --unshallow (no CI: actions/checkout com fetch-depth: 0)')
      result = scanLog(repo, ['--all'])
    } else if (args.mode === 'outgoing') result = scanLog(repo, ['HEAD', '--not', '--remotes'])
    else result = scanLog(repo, [args.range])
    scope = { history: 'histórico, todas as refs', outgoing: 'commits que ainda não estão em nenhum remoto', range: `intervalo ${args.range}` }[args.mode]
  }
  const findings = result.findings.filter((f) => !allowed(allowlist, f))
  return { scope, scanned: result.scanned, unit: result.unit, suppressed: result.findings.length - findings.length, findings }
}

export function format(report) {
  const head = `🔐 secret-scan (${report.scope}): ${report.findings.length} achado(s), ${report.scanned} ${report.unit} varrido(s)` +
    (report.suppressed ? `, ${report.suppressed} suprimido(s) pela allowlist` : '')
  if (!report.findings.length) return head
  return [
    head,
    ...report.findings.map((f) => `  - ${f.commit ? `${f.commit.slice(0, 12)} ` : ''}${f.file}${f.line ? `:${f.line}` : ''} ${f.change} — ${f.name} [${f.id}]`),
    '',
    'O valor nunca é impresso. Próximo passo, nesta ordem:',
    '  1. Rotacione/revogue a chave no provedor e troque em todos os ambientes (saas-shield-br: skills/secret-scanner/rotation-runbook.md).',
    '  2. Prove que a chave antiga não funciona mais (resposta 401/403).',
    '  3. Só depois decida sobre limpar o histórico. Em repositório público, a chave já é pública.',
    'Falso-positivo (fixture de teste, exemplo)? Registre em .secret-scan-allow.json com file, id, commit e reason.',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const report = run(process.argv.slice(2))
    process.stdout.write((process.argv.includes('--json') ? JSON.stringify(report, null, 2) : format(report)) + '\n')
    process.exit(report.findings.length ? 1 : 0)
  } catch (e) {
    if (!(e instanceof Inconclusive)) throw e
    const msg = `INCONCLUSIVO: ${e.message}`
    process.stdout.write((process.argv.includes('--json') ? JSON.stringify({ inconclusive: e.message }) : msg) + '\n')
    process.exit(2)
  }
}
