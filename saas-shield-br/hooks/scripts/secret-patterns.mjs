/**
 * Lista canônica dos secrets que o hook pré-commit (pre-commit-secret-scan.mjs) bloqueia.
 *
 * Fonte única: o hook importa daqui e skills/secret-scanner/patterns.md documenta cada `id`
 * (há teste que confere). Para incluir um padrão, adicione aqui e documente o `id` lá.
 *
 * Só entram chaves cuja presença num commit é incidente: nada de padrão genérico que dá
 * falso-positivo em placeholder. O scan amplo (30+ padrões) é o /secret-scan.
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

export default SECRET_PATTERNS
