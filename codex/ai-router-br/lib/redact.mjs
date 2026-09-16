const SECRET_NAME=/(_?api_?key|token|secret|password|passwd|credential|private_?key|service_?role|access_?key|cookie|(?:^|_)auth(?:$|_)|(?:^|_)dsn$)/i;
const CREDENTIAL_URL=/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;
const SECRET_VALUE_PATTERNS=[
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
];
export function isSecretEnvName(name) {
  return SECRET_NAME.test(name) || /^(OPENAI|ANTHROPIC|DEEPSEEK|CODEX)_(BASE_URL|API_BASE|PROJECT|ORG)/i.test(name);
}
export function sanitizeEnv(env=process.env) {
  const clean={};
  for (const [k,v] of Object.entries(env)) {
    if (isSecretEnvName(k)) continue;
    if (CREDENTIAL_URL.test(String(v??''))) continue;
    clean[k]=v;
  }
  clean.AI_ROUTER_WORKER='1';
  return clean;
}
/** Values of secret-looking variables in the current environment, for redaction only. Never log the result. */
export function secretEnvValues(env=process.env) {
  return Object.entries(env).filter(([k,v])=>v && String(v).length>=8 && (SECRET_NAME.test(k) || CREDENTIAL_URL.test(String(v)))).map(([,v])=>String(v));
}
/** Exact secret values and high-confidence token formats only. Safe for code (patches): no key=value guessing. */
export function redactKnown(value, known=[]) {
  let s=String(value??'');
  for (const secret of known.filter(Boolean).map(String).sort((a,b)=>b.length-a.length)) s=s.split(secret).join('[REDACTED]');
  for (const re of SECRET_VALUE_PATTERNS) s=s.replace(re,'[REDACTED]');
  return s;
}
export function redact(value, known=[]) {
  let s=redactKnown(value,known);
  s=s.replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;"']+/ig,'$1[REDACTED]');
  s=s.replace(/(:\/\/[^\s/:@]+:)[^\s/@]+@/g,'$1[REDACTED]@');
  s=s.replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/ig,'$1[REDACTED]');
  return s;
}
