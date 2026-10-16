#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash e PowerShell): antes de um `git commit`, varre o que vai entrar
 * no commit contra a lista crítica de secrets (secret-patterns.mjs).
 *
 * O hooks.json só chama este script quando o comando contém "git" (campo `if`).
 * Aqui o comando é quebrado em subcomandos (&&, ||, ;, |, &, quebra de linha, $(), bash -c,
 * pwsh -Command) e só segue se algum subcomando for `git [opções globais] commit`.
 * `git commit-tree` e `git log --grep commit` não contam.
 *
 * O que é varrido:
 *   - o índice (blobs staged), lido de uma vez com `git cat-file --batch`;
 *   - os arquivos que um `git add` ANTERIOR no mesmo comando vai colocar no índice
 *     (o hook roda antes do comando inteiro, então o add ainda não aconteceu);
 *   - os arquivos do working tree quando o commit usa -a/--all ou pathspec.
 *
 * Nunca monta string de shell: git é chamado com spawnSync e array de argumentos, e as
 * listas de arquivo usam -z (nomes com espaço, acento ou aspas funcionam).
 *
 * Saída: exit 0 permite; exit 2 + stderr bloqueia (o Claude recebe a mensagem).
 * Falha de leitura/git (não é repo, git ausente) → exit 0: o hook não trava quem não usa git.
 */

import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { SECRET_PATTERNS } from './secret-patterns.mjs'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 3000
const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|pdf|zip|tar|gz|tgz|bz2|xz|7z|rar|woff2?|ttf|otf|eot|mp3|mp4|mov|webm|wav|wasm|exe|dll|so|dylib|jar|class)$/i
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd'])
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'time', 'nohup', 'nice', 'env', 'xargs', '!', 'then', 'do', 'else', 'if', 'while', 'until'])
const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location'])
// opções globais do git que consomem o próximo argumento
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'])
// opções de `git commit` (forma curta) que consomem valor
const COMMIT_SHORT_WITH_VALUE = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_LONG_WITH_VALUE = new Set([
  '--message', '--file', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--author',
  '--date', '--template', '--cleanup', '--trailer', '--pathspec-from-file', '--untracked-files',
])

// ─── entrada ────────────────────────────────────────────────────────────────

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const command = payload?.tool_input?.command
if (typeof command !== 'string' || !/commit/i.test(command)) process.exit(0)

const baseCwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
const events = []
collectGitEvents(command, baseCwd, events, 0)
const commits = events.filter((e) => e.kind === 'commit')
if (commits.length === 0) process.exit(0)

// ─── varredura ──────────────────────────────────────────────────────────────

const findings = []
const seen = new Set()

for (const commit of commits) {
  const top = gitText(commit.cwd, commit.globals, ['rev-parse', '--show-toplevel'])?.trim()
  if (!top) continue

  // 1. índice
  scanStaged(commit)

  // 2. o que adds anteriores no mesmo comando vão colocar no índice
  for (const add of events) {
    if (add.kind !== 'add' || add.order > commit.order) continue
    if (add.mode === 'paths' && add.pathspecs.length === 0) continue // `git add` sem argumento não adiciona nada
    const flags = add.mode === 'update' ? ['--modified'] : ['--modified', '--others', '--exclude-standard']
    const specs = add.pathspecs.length ? add.pathspecs : [':/']
    scanWorkingTree(add, top, flags, specs)
  }

  // 3. commit -a / commit <pathspec>: entra a versão do working tree
  if (commit.all) scanWorkingTree(commit, top, ['--modified'], [':/'])
  if (commit.pathspecs.length) scanWorkingTree(commit, top, ['--modified', '--others', '--exclude-standard'], commit.pathspecs)
}

if (findings.length === 0) process.exit(0)

const lines = [
  '🛡️ saas-shield-br bloqueou o git commit: há secret no que vai ser commitado.',
  '',
  ...findings.map((f) => `  - ${f.file}:${f.line} (${f.source}) — ${f.name} [${f.id}] — ${f.preview}`),
  '',
  'O que fazer:',
  '  1. Tire o secret do arquivo: variável de ambiente no servidor; .env fora do Git.',
  '  2. Rotacione a chave no provedor. Ela já está em texto puro na máquina e pode estar no histórico.',
  '  3. Refaça o stage (git add) e tente o commit de novo.',
  '',
  'Falso-positivo? Mostre o trecho ao usuário e só siga com autorização explícita dele.',
  'Scan completo (histórico, .env, bundle): /secret-scan.',
]
process.stderr.write(lines.join('\n') + '\n')
process.exit(2)

// ─── funções ────────────────────────────────────────────────────────────────

function scanStaged(commit) {
  const raw = gitBuffer(commit.cwd, commit.globals, [
    'diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMT',
  ])
  if (!raw) return
  const parts = raw.toString('utf8').split('\0')
  const entries = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].trim().split(/\s+/) // :oldmode newmode oldsha newsha status
    const path = parts[i + 1]
    if (meta.length < 5 || !path) continue
    const [, newMode, , sha] = meta
    if (newMode === '160000' || newMode === '120000') continue // submódulo / symlink
    if (SKIP_EXT.test(path)) continue
    entries.push({ path, sha })
  }
  for (const { path, content } of readBlobs(commit, entries.slice(0, MAX_FILES))) {
    scanContent(path, content, 'staged')
  }
}

function scanWorkingTree(event, top, flags, pathspecs) {
  const out = gitBuffer(event.cwd, event.globals, ['ls-files', '-z', '--full-name', ...flags, '--', ...pathspecs])
  if (!out) return
  const files = [...new Set(out.toString('utf8').split('\0').filter(Boolean))].slice(0, MAX_FILES)
  for (const rel of files) {
    if (SKIP_EXT.test(rel)) continue
    const abs = join(top, rel)
    let buf
    try {
      const st = statSync(abs)
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue
      buf = readFileSync(abs)
    } catch {
      continue // apagado ou ilegível
    }
    if (isBinary(buf)) continue
    scanContent(rel, buf.toString('utf8'), 'working tree')
  }
}

function readBlobs(event, entries) {
  if (entries.length === 0) return []
  const check = gitBuffer(event.cwd, event.globals, ['cat-file', '--batch-check'], entries.map((e) => e.sha).join('\n') + '\n')
  if (!check) return []
  const info = check.toString('utf8').split('\n')
  const keep = entries.filter((_, i) => {
    const [, type, size] = (info[i] ?? '').split(' ')
    return type === 'blob' && Number(size) <= MAX_FILE_BYTES
  })
  if (keep.length === 0) return []
  const out = gitBuffer(event.cwd, event.globals, ['cat-file', '--batch'], keep.map((e) => e.sha).join('\n') + '\n')
  if (!out) return []
  const result = []
  let pos = 0
  for (const entry of keep) {
    const nl = out.indexOf(0x0a, pos)
    if (nl < 0) break
    const [, type, sizeStr] = out.subarray(pos, nl).toString('utf8').split(' ')
    const size = Number(sizeStr)
    if (type !== 'blob' || !Number.isFinite(size)) { pos = nl + 1; continue }
    const content = out.subarray(nl + 1, nl + 1 + size)
    pos = nl + 1 + size + 1
    if (!isBinary(content)) result.push({ path: entry.path, content: content.toString('utf8') })
  }
  return result
}

function scanContent(file, content, source) {
  for (const p of SECRET_PATTERNS) {
    for (const m of content.matchAll(p.regex)) {
      if (p.validate && !p.validate(m[0])) continue
      const key = `${file}\0${p.id}`
      if (seen.has(key)) break
      seen.add(key)
      findings.push({
        file,
        source,
        id: p.id,
        name: p.name,
        line: content.slice(0, m.index).split('\n').length,
        preview: p.id === 'private-key-block' ? m[0] : `${m[0].slice(0, 10)}…`,
      })
      break
    }
  }
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0)
}

function gitBuffer(cwd, globals, args, input) {
  const r = spawnSync('git', [...globals, ...args], {
    cwd,
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 10_000,
    windowsHide: true,
  })
  if (r.error || r.status !== 0) return null
  return r.stdout
}

function gitText(cwd, globals, args) {
  return gitBuffer(cwd, globals, args)?.toString('utf8') ?? null
}

// ─── parse do comando ───────────────────────────────────────────────────────

/** Quebra o comando em subcomandos (lista de tokens), respeitando aspas. */
function splitCommands(cmd) {
  const segments = []
  const nested = [] // conteúdo de $( … ) e `…` vira comando à parte
  let tokens = []
  let tok = null
  const flushTok = () => { if (tok !== null) { tokens.push(tok); tok = null } }
  const flushSeg = () => { flushTok(); if (tokens.length) segments.push(tokens); tokens = [] }
  let i = 0
  while (i < cmd.length) {
    const c = cmd[i]
    if (c === "'") {
      const end = cmd.indexOf("'", i + 1)
      const stop = end < 0 ? cmd.length : end
      tok = (tok ?? '') + cmd.slice(i + 1, stop)
      i = stop + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let s = ''
      while (j < cmd.length && cmd[j] !== '"') {
        if ((cmd[j] === '\\' || cmd[j] === '`') && j + 1 < cmd.length && /["\\`$]/.test(cmd[j + 1])) {
          s += cmd[j + 1]
          j += 2
          continue
        }
        if (cmd[j] === '$' && cmd[j + 1] === '(') {
          const close = matchParen(cmd, j + 1)
          nested.push(cmd.slice(j + 2, close))
        }
        s += cmd[j]
        j++
      }
      tok = (tok ?? '') + s
      i = j + 1
      continue
    }
    if (c === '\\' && i + 1 < cmd.length && /[\s'"\\;&|()`]/.test(cmd[i + 1])) {
      if (cmd[i + 1] !== '\n') tok = (tok ?? '') + cmd[i + 1] // \<quebra> = continuação de linha
      i += 2
      continue
    }
    if (c === '$' && cmd[i + 1] === '(') {
      const close = matchParen(cmd, i + 1)
      nested.push(cmd.slice(i + 2, close))
      i = close + 1
      continue
    }
    if (c === '`') {
      const end = cmd.indexOf('`', i + 1)
      const stop = end < 0 ? cmd.length : end
      nested.push(cmd.slice(i + 1, stop))
      i = stop + 1
      continue
    }
    if (/\s/.test(c) && c !== '\n') { flushTok(); i++; continue }
    if (c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')') { flushSeg(); i++; continue }
    tok = (tok ?? '') + c
    i++
  }
  flushSeg()
  return { segments, nested }
}

function matchParen(s, open) {
  let depth = 0
  for (let k = open; k < s.length; k++) {
    if (s[k] === '(') depth++
    else if (s[k] === ')' && --depth === 0) return k
  }
  return s.length
}

function baseName(word) {
  return word.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase()
}

function resolvePath(cwd, p) {
  if (!p) return cwd
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = join(homedir(), p.slice(1))
  return isAbsolute(p) ? p : resolve(cwd, p)
}

/** Percorre os subcomandos em ordem, seguindo `cd`, e registra `git add` e `git commit`. */
function collectGitEvents(cmd, startCwd, out, depth) {
  if (depth > 3) return startCwd
  const { segments, nested } = splitCommands(cmd)
  let cwd = startCwd
  for (const n of nested) collectGitEvents(n, cwd, out, depth + 1)
  for (const raw of segments) {
    let t = raw.filter((w) => w !== '{' && w !== '}')
    while (t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]) || WRAPPERS.has(t[0].toLowerCase()) || /^-/.test(t[0]))) t = t.slice(1)
    if (!t.length) continue
    const head = baseName(t[0])

    if (CD.has(head)) {
      const target = t.slice(1).find((w) => !w.startsWith('-'))
      if (target) cwd = resolvePath(cwd, target)
      continue
    }

    if (SHELLS.has(head)) {
      const idx = t.findIndex((w, k) => k > 0 && /^(-c|-command|\/c|-commandwithargs)$/i.test(w))
      if (idx > 0 && t[idx + 1]) collectGitEvents(t.slice(idx + 1).join(' '), cwd, out, depth + 1)
      continue
    }

    if (head !== 'git') continue
    let gitCwd = cwd
    const globals = []
    let i = 1
    while (i < t.length && t[i].startsWith('-')) {
      const o = t[i]
      const eq = o.indexOf('=')
      const name = eq > 0 ? o.slice(0, eq) : o
      const inline = eq > 0 ? o.slice(eq + 1) : undefined
      if (GIT_GLOBAL_WITH_VALUE.has(name)) {
        const value = inline ?? t[i + 1]
        if (name === '-C') gitCwd = resolvePath(gitCwd, value)
        if (name === '--git-dir' || name === '--work-tree') globals.push(`${name}=${resolvePath(gitCwd, value)}`)
        i += inline === undefined ? 2 : 1
        continue
      }
      i++
    }
    const sub = t[i]
    const args = t.slice(i + 1)
    const order = out.length
    if (sub === 'commit') out.push({ kind: 'commit', order, cwd: gitCwd, globals, ...parseCommitArgs(args) })
    else if (sub === 'add' || sub === 'stage') out.push({ kind: 'add', order, cwd: gitCwd, globals, ...parseAddArgs(args) })
  }
  return cwd
}

// Redirecionamento (`> out.txt`, `2>`, `<in`) não é argumento do git.
function stripRedirections(args) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (/^\d*(>>?|<)$/.test(args[i])) { i++; continue }
    if (/^\d*(>>?|<)/.test(args[i])) continue
    out.push(args[i])
  }
  return out
}

function parseCommitArgs(rawArgs) {
  const args = stripRedirections(rawArgs)
  let all = false
  const pathspecs = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { pathspecs.push(...args.slice(i + 1)); break }
    if (a.startsWith('--')) {
      if (a === '--all') all = true
      else if (COMMIT_LONG_WITH_VALUE.has(a)) i++
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const f = a[k]
        if (f === 'a') all = true
        if (COMMIT_SHORT_WITH_VALUE.has(f)) {
          if (k === a.length - 1) i++ // valor no próximo token
          break
        }
      }
      continue
    }
    pathspecs.push(a)
  }
  return { all, pathspecs }
}

function parseAddArgs(rawArgs) {
  const args = stripRedirections(rawArgs)
  let mode = 'paths'
  const pathspecs = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { pathspecs.push(...args.slice(i + 1)); break }
    if (a === '-A' || a === '--all' || a === '--no-ignore-removal') { mode = 'all'; continue }
    if (a === '-u' || a === '--update') { mode = 'update'; continue }
    if (a.startsWith('--pathspec-from-file')) { mode = 'all'; continue } // não lê o arquivo: varre tudo
    if (a === '--chmod') { i++; continue }
    if (a.startsWith('-')) continue
    pathspecs.push(a)
  }
  return { mode, pathspecs }
}
