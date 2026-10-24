/**
 * Lista canônica dos secrets que o saas-shield-br bloqueia: hook pré-commit/pré-push do Claude Code,
 * hook das ferramentas MCP do GitHub e o CLI secret-scan.mjs (staged, histórico, commits que vão sair).
 *
 * Fonte única: todos importam daqui e skills/secret-scanner/patterns.md documenta cada `id`
 * (há teste que confere). Para incluir um padrão, adicione aqui, documente o `id` lá e escreva o
 * teste que deve reprovar.
 *
 * Só entram chaves cuja presença num commit é incidente: nada de padrão genérico que dá
 * falso-positivo em placeholder. O scan amplo (30+ padrões) é o /secret-scan.
 *
 * Este arquivo é copiado sem mudança para scripts/security/ dos projetos (kit do padrao-saas);
 * o validate.mjs do marketplace confere que as cópias são idênticas.
 *
 * Formato de cada item:
 *   id        identificador estável (kebab-case), citado no patterns.md
 *   name      nome legível mostrado na mensagem de bloqueio
 *   regex     RegExp com flag g
 *   validate  opcional: (match) => boolean. false descarta o match (ex.: JWT anon)
 */

/**
 * JWT do Supabase só é secret quando o payload diz role = service_role (anon é pública)
 * e o emissor é o Supabase. As chaves do `supabase start` (iss = supabase-demo) são
 * públicas, iguais em toda máquina, e não bloqueiam.
 */
export function isServiceRoleJwt(token) {
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return claims?.role === 'service_role' &&
      typeof claims.iss === 'string' && claims.iss.startsWith('supabase') && claims.iss !== 'supabase-demo'
  } catch {
    return false
  }
}

// Senha de exemplo ou de ambiente local em URL de banco não é incidente.
const PLACEHOLDER_PASSWORD = /^(?:password|senha|postgres|pass(?:word)?\d*|secret|changeme|example|exemplo|your[-_]?password|<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|x+|\*+)$/i
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal|db|postgres|mysql|redis|mongo)(?::\d+)?(?:[/?]|$)/i

export function isRealDatabaseUrl(url) {
  const m = /^[a-z+]+:\/\/[^\s:@/]+:([^\s@]+)@(.+)$/i.exec(url)
  if (!m) return false
  return !PLACEHOLDER_PASSWORD.test(m[1]) && !LOCAL_HOST.test(m[2])
}

export const SECRET_PATTERNS = [
  {
    id: 'supabase-service-role-jwt',
    name: 'Supabase service_role (JWT legado)',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    validate: isServiceRoleJwt,
  },
  {
    id: 'supabase-secret-key',
    name: 'Supabase secret key (sb_secret_)',
    regex: /\bsb_secret_[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: 'supabase-personal-access-token',
    name: 'Supabase personal access token (sbp_)',
    regex: /\bsbp_[a-f0-9]{40}(?![a-f0-9])/g,
  },
  {
    id: 'stripe-live-secret',
    name: 'Stripe live secret key',
    regex: /\bsk_live_[A-Za-z0-9]{24,}/g,
  },
  {
    id: 'stripe-live-restricted',
    name: 'Stripe restricted key (live)',
    regex: /\brk_live_[A-Za-z0-9]{24,}/g,
  },
  {
    id: 'stripe-webhook-secret',
    name: 'Stripe webhook secret',
    regex: /\bwhsec_[A-Za-z0-9]{32,}/g,
  },
  {
    id: 'aws-access-key-id',
    name: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    // AKIAIOSFODNN7EXAMPLE e afins são exemplos da documentação da AWS
    validate: (m) => !m.endsWith('EXAMPLE'),
  },
  {
    id: 'anthropic-api-key',
    name: 'Anthropic API key',
    regex: /\bsk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{80,}/g,
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API key',
    // (?!ant-) evita contar a chave Anthropic de novo
    regex: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{40,}/g,
  },
  {
    id: 'deepseek-api-key',
    name: 'DeepSeek API key',
    // sk- + 32 hexadecimais; não colide com a OpenAI (40+ caracteres)
    regex: /\bsk-[a-f0-9]{32}(?![A-Za-z0-9_-])/g,
  },
  {
    id: 'google-api-key',
    name: 'Google / Gemini API key (AIza…)',
    regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
  },
  {
    id: 'meta-access-token',
    name: 'Meta / WhatsApp Cloud API access token (EAA…)',
    // Fora de base64: não pode estar colado a outro caractere de base64 dos dois lados
    regex: /(?<![A-Za-z0-9+/=])EAA[A-Za-z0-9]{80,}(?![A-Za-z0-9+/=])/g,
  },
  {
    id: 'database-url-with-password',
    name: 'URL de banco com senha',
    regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:@/'"`]+:[^\s@'"`]{6,}@[^\s'"`<>]+/g,
    validate: isRealDatabaseUrl,
  },
  {
    id: 'npm-access-token',
    name: 'npm access token (npm_)',
    regex: /\bnpm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g,
  },
  {
    id: 'github-token',
    name: 'GitHub token (ghp_/gho_/ghs_/ghu_/ghr_)',
    regex: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'github-fine-grained-pat',
    name: 'GitHub fine-grained PAT',
    regex: /\bgithub_pat_[A-Za-z0-9_]{70,}/g,
  },
  {
    id: 'slack-token',
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: 'private-key-block',
    name: 'Chave privada (bloco PEM)',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
]

/** Marca para suprimir um falso-positivo na própria linha. */
export const IGNORE_MARKER = 'secret-scan: ignore'

/**
 * Primeiro achado de cada padrão no texto: { id, name, line, preview }.
 * O preview nunca traz a chave inteira (10 caracteres + …; no bloco PEM, só o cabeçalho).
 */
export function scanText(content) {
  const out = []
  for (const p of SECRET_PATTERNS) {
    for (const m of content.matchAll(p.regex)) {
      if (p.validate && !p.validate(m[0])) continue
      const start = content.lastIndexOf('\n', m.index) + 1
      const end = content.indexOf('\n', m.index)
      if (content.slice(start, end < 0 ? undefined : end).includes(IGNORE_MARKER)) continue
      out.push({
        id: p.id,
        name: p.name,
        line: content.slice(0, m.index).split('\n').length,
        preview: p.id === 'private-key-block' ? m[0] : `${m[0].slice(0, 10)}…`,
      })
      break
    }
  }
  return out
}

export default SECRET_PATTERNS
