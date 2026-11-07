#!/usr/bin/env node
/**
 * scripts/sync-global.mjs
 *
 * Leva para a máquina a configuração pessoal do Claude Code que não vem pelos plugins:
 *
 *   1. Bloco gerenciado no CLAUDE.md global (~/.claude/CLAUDE.md), a partir de
 *      global/claude/CLAUDE.md, entre os marcadores abaixo. O que estiver fora do bloco
 *      é preservado. Se o arquivo não tem os marcadores mas já contém o texto do bloco,
 *      só envolve esse texto com os marcadores. Antes de qualquer escrita, faz backup.
 *   2. Skills pessoais da Vercel (global/claude/vercel-skills.json) em ~/.claude/skills,
 *      copiadas de um commit fixo via git sparse-checkout (nenhum script de terceiro é
 *      executado). Pasta com o mesmo nome que não foi instalada por este script não é tocada.
 *
 * Uso:
 *   node scripts/sync-global.mjs            # só mostra o que faria
 *   node scripts/sync-global.mjs --apply    # aplica
 *   --claude-dir <dir>                      # padrão: $CLAUDE_CONFIG_DIR ou ~/.claude
 *   --skip-skills | --skip-claude-md
 *
 * Saída: uma linha por item ("ok", "faria", "aviso"). Exit 1 só em erro.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, cpSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const START = '<!-- morallesfilms-local:start -->'
export const END = '<!-- morallesfilms-local:end -->'
const LOCK = '.vercel-agent-skills.lock.json'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const norm = (s) => s.replace(/\r\n/g, '\n')

/** Devolve o novo conteúdo do CLAUDE.md e o que aconteceu. Função pura (testável). */
export function mergeClaudeMd(current, body) {
  const block = `${START}\n${norm(body).trim()}\n${END}`
  if (current == null) return { status: 'criado', text: block + '\n' }
  const cur = norm(current)
  const s = cur.indexOf(START)
  const e = cur.indexOf(END)
  if (s !== -1 && e > s) {
    const next = cur.slice(0, s) + block + cur.slice(e + END.length)
    return next === cur ? { status: 'igual', text: cur } : { status: 'atualizado', text: next }
  }
  if (s !== -1 || e !== -1) return { status: 'marcador-quebrado', text: cur }
  const plain = norm(body).trim()
  const at = cur.indexOf(plain)
  if (at !== -1) {
    return { status: 'marcado', text: cur.slice(0, at) + block + cur.slice(at + plain.length) }
  }
  return { status: 'acrescentado', text: cur.replace(/\s*$/, '') + '\n\n' + block + '\n' }
}

function syncClaudeMd(claudeDir, apply, log) {
  const target = join(claudeDir, 'CLAUDE.md')
  const body = readFileSync(join(REPO_ROOT, 'global', 'claude', 'CLAUDE.md'), 'utf8')
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null
  const r = mergeClaudeMd(current, body)
  if (r.status === 'igual') return log('ok', `CLAUDE.md global já tem o bloco atual (${target})`)
  if (r.status === 'marcador-quebrado') {
    return log('aviso', `${target} tem só um dos marcadores ${START}/${END}; corrija à mão e rode de novo`)
  }
  if (!apply) return log('faria', `CLAUDE.md global: ${r.status} (${target})`)
  mkdirSync(claudeDir, { recursive: true })
  if (current != null) {
    const bak = `${target}.bak-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
    copyFileSync(target, bak)
    log('ok', `backup em ${bak}`)
  }
  writeFileSync(target, r.text)
  log('ok', `CLAUDE.md global: ${r.status}${current == null ? '' : '; conteúdo fora do bloco preservado'} (${target})`)
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
}

function syncSkills(claudeDir, apply, log) {
  const cfg = JSON.parse(readFileSync(join(REPO_ROOT, 'global', 'claude', 'vercel-skills.json'), 'utf8'))
  const skillsDir = join(claudeDir, 'skills')
  const lockPath = join(skillsDir, LOCK)
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null
  const owned = new Set(lock?.skills ?? [])

  const todo = []
  for (const s of cfg.skills) {
    const dest = join(skillsDir, s.name)
    if (!existsSync(dest)) todo.push(s)
    else if (!owned.has(s.name)) log('aviso', `${dest} existe e não foi instalada por este script; não mexi`)
    else if (lock.commit !== cfg.commit) todo.push(s)
  }
  const managed = cfg.skills.filter((s) => owned.has(s.name) || todo.includes(s)).map((s) => s.name)
  if (!todo.length) return log('ok', `skills da Vercel no commit ${cfg.commit.slice(0, 7)} (${managed.join(', ')})`)
  if (!apply) return log('faria', `instalar/atualizar ${todo.map((s) => s.name).join(', ')} do commit ${cfg.commit.slice(0, 7)}`)

  const tmp = mkdtempSync(join(tmpdir(), 'vercel-skills-'))
  try {
    git(['clone', '--quiet', '--filter=blob:none', '--no-checkout', cfg.repo, tmp])
    git(['sparse-checkout', 'set', ...todo.map((s) => s.dir)], tmp)
    git(['checkout', '--quiet', cfg.commit], tmp)
    mkdirSync(skillsDir, { recursive: true })
    for (const s of todo) {
      const src = join(tmp, s.dir)
      if (!existsSync(join(src, 'SKILL.md'))) throw new Error(`${s.dir}/SKILL.md não existe no commit ${cfg.commit}`)
      const dest = join(skillsDir, s.name)
      rmSync(dest, { recursive: true, force: true }) // só pastas que este script instalou (checado acima)
      cpSync(src, dest, { recursive: true })
      log('ok', `skill ${s.name} instalada (${dest})`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  writeFileSync(lockPath, JSON.stringify({
    source: cfg.repo.replace(/\.git$/, ''),
    commit: cfg.commit,
    installedAt: new Date().toISOString().slice(0, 10),
    installedBy: 'claude-plugins/scripts/sync-global.mjs (git sparse-checkout do commit; nenhum script de terceiro executado)',
    skills: managed,
    skipped: cfg.skipped,
  }, null, 2) + '\n')
}

function main(argv) {
  const apply = argv.includes('--apply')
  const i = argv.indexOf('--claude-dir')
  const claudeDir = i !== -1 ? argv[i + 1] : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  let failed = false
  const log = (kind, msg) => console.log(`${kind === 'ok' ? '[OK]' : kind === 'faria' ? '[faria]' : '[!]'} ${msg}`)
  for (const [skip, fn, label] of [
    ['--skip-claude-md', syncClaudeMd, 'CLAUDE.md'],
    ['--skip-skills', syncSkills, 'skills'],
  ]) {
    if (argv.includes(skip)) continue
    try { fn(claudeDir, apply, log) } catch (e) { failed = true; console.log(`[X] ${label}: ${e.message.split('\n')[0]}`) }
  }
  process.exit(failed ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
