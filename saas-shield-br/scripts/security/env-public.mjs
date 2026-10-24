/**
 * Quando um arquivo .env versionado é aceitável.
 *
 * Regra (a mesma do ai-router-br, lib/security.mjs → publicEnvFile, testada com os mesmos casos):
 *   - .env.example / .env.sample / .env.template são documentação: passam (o conteúdo ainda é
 *     varrido pelos padrões de secret-patterns.mjs);
 *   - qualquer outro .env* só passa se TODAS as linhas forem comentário, vazias ou
 *     `[export] PREFIXO_PUBLICO_NOME=valor`, com prefixo que o framework já põe no bundle do
 *     navegador (NEXT_PUBLIC_, VITE_, PUBLIC_, EXPO_PUBLIC_, REACT_APP_, NUXT_PUBLIC_, GATSBY_),
 *     sem nome com cara de segredo (KEY, TOKEN, SECRET, PASSWORD, SERVICE_ROLE…) e sem valor com
 *     formato de segredo (JWT, sk-, AIza, sb_secret_, chave PEM, URL com usuário:senha);
 *   - arquivo maior que 16 KB, valor em várias linhas ou linha que não é atribuição: bloqueia.
 * A anon key do Supabase em JWT continua bloqueando: pelo formato não dá para separar anon de
 * service_role sem decodificar, e um .env versionado não deve depender disso.
 *
 * Este arquivo é copiado sem mudança para scripts/security/ dos projetos (kit do padrao-saas).
 */

const ENV_FILE = /(^|\/)\.env($|\.)/i
const ENV_DOC = /\.env(?:\.[^/]+)*\.(example|sample|template)$/i
const PUBLIC_ENV_KEY = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|GATSBY_)[A-Za-z0-9_]+$/
const SECRET_NAME = /(_?api_?key|token|secret|password|passwd|credential|private_?key|service_?role|access_?key|cookie|(?:^|_)auth(?:$|_)|(?:^|_)dsn$)/i
const CREDENTIAL_URL = /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /sb_secret_|-----BEGIN/,
]
const MAX_BYTES = 16384

const norm = (p) => String(p).replace(/\\/g, '/')

/** O caminho é um arquivo .env* que não é documentação (.example/.sample/.template). */
export function isEnvFile(path) {
  const p = norm(path)
  return ENV_FILE.test(p) && !ENV_DOC.test(p)
}

export function isSecretEnvName(name) {
  return SECRET_NAME.test(name) || /^(OPENAI|ANTHROPIC|DEEPSEEK|CODEX)_(BASE_URL|API_BASE|PROJECT|ORG)/i.test(name)
}

export function secretShapedValue(value) {
  const s = String(value ?? '')
  return CREDENTIAL_URL.test(s) || SECRET_VALUE.some((re) => re.test(s))
}

/** true se o conteúdo só tem variáveis públicas por definição (ver regra no topo). */
export function isPublicEnvContent(text) {
  const s = String(text ?? '')
  if (Buffer.byteLength(s, 'utf8') > MAX_BYTES) return false
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (!m || !PUBLIC_ENV_KEY.test(m[1]) || isSecretEnvName(m[1]) || secretShapedValue(m[2])) return false
    const value = m[2].trim()
    // aspas abertas e não fechadas na mesma linha = valor em várias linhas
    if (/^["']/.test(value) && (value.length < 2 || value.at(-1) !== value[0])) return false
  }
  return true
}

/**
 * null se o arquivo pode ser versionado; senão { id, name, reason } para a mensagem de bloqueio.
 * Use só com o conteúdo que vai ser commitado (índice, blob do commit), não com o working tree.
 */
export function envFileProblem(path, text) {
  if (!isEnvFile(path)) return null
  if (isPublicEnvContent(text)) return null
  return {
    id: 'env-file-versionado',
    name: 'Arquivo .env com valor que não é público',
    reason: 'só .env.example/.sample/.template, ou .env com apenas variáveis públicas (NEXT_PUBLIC_, VITE_…) sem nome nem valor de segredo, podem ir para o Git',
  }
}
