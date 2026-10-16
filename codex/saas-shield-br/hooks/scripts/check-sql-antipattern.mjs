#!/usr/bin/env node
/**
 * Hook PreToolUse (Edit|Write): bloqueia migration SQL que introduz anti-pattern crítico de RLS.
 *
 * Avalia o ARQUIVO COMO VAI FICAR, não só o trecho:
 *   - Write: o conteúdo novo inteiro;
 *   - Edit: lê o arquivo atual e aplica old_string → new_string (respeitando replace_all).
 *     Arquivo ainda inexistente: usa o texto novo. old_string não encontrado (o Edit vai
 *     falhar de qualquer jeito): checa só o trecho, sem as regras que dependem do arquivo todo.
 *
 * Bloqueia apenas o que a mudança INTRODUZ. Problema que já existia no arquivo vira aviso,
 * para não travar uma edição pequena numa migration antiga.
 *
 * Bloqueantes (exit 2 + stderr):
 *   - tabela criada em `public` sem `enable row level security` no mesmo arquivo;
 *   - RLS habilitada sem `force row level security` (por tabela);
 *   - `disable row level security` / `no force row level security`;
 *   - policy com `using (true)` ou `with check (true)`;
 *   - função/procedure `security definer` sem `set search_path` (em qualquer ordem de cláusula
 *     no cabeçalho, inclusive depois do corpo, ou via `alter function … set search_path`).
 *
 * Avisos (exit 0, vão para o contexto do Claude via additionalContext):
 *   - `security definer` com search_path diferente de '' (padrão: '' + nomes qualificados);
 *   - tabela nova sem nenhuma policy (deny-all) ou sem `revoke … from anon` explícito.
 *
 * Comentários, strings e corpos $$…$$ são neutralizados antes da análise: texto dentro deles
 * não dispara nem satisfaz regra.
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const input = payload?.tool_input ?? {}
const rawPath = typeof input.file_path === 'string' ? input.file_path : ''
if (!/\.sql$/i.test(rawPath) || !/migrations/i.test(rawPath)) process.exit(0)

const cwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
const filePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath)
const norm = (s) => String(s).replace(/\r\n/g, '\n')

let before = null
try {
  before = norm(readFileSync(filePath, 'utf-8'))
} catch {
  before = null // arquivo novo
}

let after
let partial = false
if (typeof input.content === 'string') {
  after = norm(input.content)
} else if (typeof input.new_string === 'string') {
  const oldStr = norm(input.old_string ?? '')
  const newStr = norm(input.new_string)
  if (before === null || oldStr === '') {
    after = newStr
    partial = before !== null && before.trim() !== ''
  } else if (!before.includes(oldStr)) {
    after = newStr
    partial = true
  } else if (input.replace_all === true) {
    after = before.split(oldStr).join(newStr)
  } else {
    const at = before.indexOf(oldStr)
    after = before.slice(0, at) + newStr + before.slice(at + oldStr.length)
  }
} else {
  process.exit(0)
}

const now = analyze(after, { partial })
const prev = before !== null && !partial ? analyze(before, { partial: false }) : { blockers: [], warnings: [] }
const prevKeys = new Set(prev.blockers.map((b) => b.key))
const introduced = now.blockers.filter((b) => !prevKeys.has(b.key))
const preexisting = now.blockers.filter((b) => prevKeys.has(b.key))
const warnings = [
  ...preexisting.map((b) => `${b.msg} (já existia no arquivo antes desta edição)`),
  ...now.warnings.map((w) => w.msg),
]

if (introduced.length > 0) {
  const msg = [
    `🛡️ saas-shield-br bloqueou a edição de ${rawPath}`,
    '',
    ...introduced.map((b) => `  - 🚨 ${b.msg}`),
    ...(warnings.length ? ['', 'Avisos:', ...warnings.map((w) => `  - 🟡 ${w}`)] : []),
    '',
    'Corrija no próprio SQL (template: skill supabase-migrator; revisão: skill rls-reviewer).',
    'Falso-positivo? Mostre o trecho ao usuário e só siga com aprovação explícita dele.',
  ].join('\n')
  process.stderr.write(msg + '\n')
  process.exit(2)
}

if (warnings.length > 0) {
  const msg = [
    `saas-shield-br: avisos em ${rawPath} (não bloqueiam)`,
    ...warnings.map((w) => `- ${w}`),
    'Considere rodar /check-rls neste arquivo.',
  ].join('\n')
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg },
  }))
}
process.exit(0)

// ─── análise ────────────────────────────────────────────────────────────────

/**
 * Separa o SQL em comandos. Remove comentários; troca corpos $tag$…$tag$ por um marcador;
 * em `bare` troca literais '…' por ''. `text` mantém os literais (para ler o search_path).
 */
function splitStatements(sql) {
  const out = []
  let text = ''
  let bare = ''
  const push = () => {
    if (bare.trim()) out.push({ text: collapse(text), bare: collapse(bare).toLowerCase() })
    text = ''
    bare = ''
  }
  const n = sql.length
  let i = 0
  while (i < n) {
    const c = sql[i]
    const d = sql[i + 1]
    if (c === '-' && d === '-') {
      const j = sql.indexOf('\n', i)
      i = j < 0 ? n : j
      text += ' '
      bare += ' '
      continue
    }
    if (c === '/' && d === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2 }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2 }
        else j++
      }
      i = j
      text += ' '
      bare += ' '
      continue
    }
    if (c === "'") {
      const escapes = /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? '')
      let j = i + 1
      while (j < n) {
        if (escapes && sql[j] === '\\') { j += 2; continue }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue }
          break
        }
        j++
      }
      text += sql.slice(i, j + 1)
      bare += "''"
      i = j + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue }
          break
        }
        j++
      }
      const ident = sql.slice(i, j + 1)
      text += ident
      bare += ident
      i = j + 1
      continue
    }
    if (c === '$' && !/[\w$]/.test(sql[i - 1] ?? '')) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 66))
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length)
        i = end < 0 ? n : end + m[0].length
        text += ' $body$ '
        bare += ' $body$ '
        continue
      }
    }
    if (c === ';') {
      push()
      i++
      continue
    }
    text += c
    bare += c
    i++
  }
  push()
  return out
}

function collapse(s) {
  return s.replace(/\s+/g, ' ').trim()
}

/** Nome qualificado e normalizado: sem aspas, minúsculo, `public.` quando sem schema. */
function qualify(name) {
  const n = name.replace(/"/g, '').toLowerCase()
  return n.includes('.') ? n : `public.${n}`
}

function analyze(sql, { partial }) {
  const statements = splitStatements(sql)
  const blockers = []
  const warnings = []
  const tables = new Map() // nome → { created, rls, force, disabled, noforce }
  const policiesOn = new Set()
  const revokedFromAnon = new Set()
  const revokedSchemas = new Set()
  const definers = [] // { name, hasPath, emptyPath }
  const pathFixed = new Set()

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, { created: false, rls: undefined, force: undefined, disabled: false, noforce: false })
    return tables.get(name)
  }

  for (const { text, bare } of statements) {
    let m

    if ((m = /^create (?:(?:global|local) )?(temp |temporary )?(?:unlogged )?table (?:if not exists )?([^\s(]+)/.exec(bare))) {
      if (m[1]) continue
      const name = qualify(m[2])
      if (!name.startsWith('public.')) continue // exige RLS só no schema exposto padrão
      Object.assign(table(name), { created: true, rls: false, force: false, disabled: false, noforce: false })
      continue
    }

    if ((m = /^alter table (?:if exists )?(?:only )?([^\s]+) (.*)$/.exec(bare))) {
      const t = table(qualify(m[1]))
      for (const action of m[2].split(',').map((a) => a.trim())) {
        if (/^enable row level security$/.test(action)) { t.rls = true; t.disabled = false }
        else if (/^disable row level security$/.test(action)) { t.rls = false; t.disabled = true }
        else if (/^force row level security$/.test(action)) { t.force = true; t.noforce = false }
        else if (/^no force row level security$/.test(action)) { t.force = false; t.noforce = true }
      }
      continue
    }

    if ((m = /^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/.exec(bare))) {
      for (const name of m[1].split(',')) tables.delete(qualify(name.trim()))
      continue
    }

    if ((m = /^create policy ("[^"]+"|\S+) on ([^\s]+)(.*)$/.exec(bare))) {
      const policy = m[1].replace(/"/g, '')
      const target = qualify(m[2])
      policiesOn.add(target)
      if (/\busing ?\( ?true ?\)/.test(m[3])) {
        blockers.push({ key: `using-true:${policy}@${target}`, msg: `Policy ${policy} em ${target} com USING (true): equivale a desligar a RLS.` })
      }
      if (/\bwith check ?\( ?true ?\)/.test(m[3])) {
        blockers.push({ key: `check-true:${policy}@${target}`, msg: `Policy ${policy} em ${target} com WITH CHECK (true): permite gravar em qualquer tenant.` })
      }
      continue
    }

    if ((m = /^revoke .*? on (?:table )?(.+?) from (.+)$/.exec(bare))) {
      const list = m[1]
      const roles = m[2]
      // revoke de PUBLIC não tira o grant direto que o Supabase dá a anon
      if (!/\banon\b/.test(roles)) continue
      if ((m = /^all tables in schema (.+)$/.exec(list))) {
        for (const s of m[1].split(',')) revokedSchemas.add(s.trim().replace(/"/g, ''))
        continue
      }
      if (/^(function|functions|procedure|routine|schema|sequence|database|type|domain|language|foreign|large object|all )/.test(list)) continue
      for (const name of list.split(',')) revokedFromAnon.add(qualify(name.trim()))
      continue
    }

    if ((m = /^create (?:or replace )?(function|procedure) ([^\s(]+)/.exec(bare))) {
      if (!/\bsecurity definer\b/.test(bare)) continue
      definers.push({
        kind: m[1],
        name: qualify(m[2]),
        hasPath: /\bset search_path\b/.test(bare),
        emptyPath: /\bset\s+search_path\s*(?:=|\bto\b)\s*''/i.test(text),
      })
      continue
    }

    if ((m = /^alter (?:function|procedure|routine) ([^\s(]+)/.exec(bare)) && /\bset search_path\b/.test(bare)) {
      pathFixed.add(qualify(m[1]))
    }
  }

  for (const f of definers) {
    if (!f.hasPath && !pathFixed.has(f.name)) {
      blockers.push({
        key: `definer-sem-search-path:${f.name}`,
        msg: `${f.kind} ${f.name} é SECURITY DEFINER sem SET search_path: vulnerável a sequestro de search_path. Use set search_path = '' e nomes qualificados.`,
      })
    } else if (f.hasPath && !f.emptyPath) {
      warnings.push({ msg: `${f.kind} ${f.name}: SECURITY DEFINER com search_path diferente de ''. O padrão é set search_path = '' com nomes qualificados (P2).` })
    }
  }

  if (partial) return { blockers, warnings } // trecho solto: sem contexto do arquivo todo

  for (const [name, t] of tables) {
    if (t.created && !t.rls) {
      blockers.push({ key: `sem-rls:${name}`, msg: `Tabela ${name} criada sem ENABLE ROW LEVEL SECURITY na mesma migration: fica aberta para quem tem a anon key.` })
    }
    if (t.disabled && !t.created) {
      blockers.push({ key: `rls-desligada:${name}`, msg: `DISABLE ROW LEVEL SECURITY em ${name}.` })
    }
    if ((t.rls && !t.force) || t.noforce) {
      blockers.push({ key: `sem-force:${name}`, msg: `${name} com RLS sem FORCE ROW LEVEL SECURITY: o dono da tabela ignora as policies.` })
    }
    if (t.created) {
      if (!policiesOn.has(name)) {
        warnings.push({ msg: `${name} sem nenhuma CREATE POLICY: ninguém além do servidor acessa (ok se for intencional).` })
      }
      const schema = name.split('.')[0]
      if (!revokedFromAnon.has(name) && !revokedSchemas.has(schema)) {
        warnings.push({ msg: `${name} sem revoke explícito de anon/authenticated: não dependa dos default privileges do Supabase (revoke all … from anon, authenticated; grant só o necessário).` })
      }
    }
  }

  return { blockers, warnings }
}
