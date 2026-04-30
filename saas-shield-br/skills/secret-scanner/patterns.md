# Secret Scanner — Patterns

Padrões organizados por provedor. Severidade: 🚨 = expôs key real | 🟡 = padrão suspeito | 🔵 = informativo.

## Supabase

| Pattern | O que é | Severidade |
|---|---|---|
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS[^"]{40,}` | JWT Supabase (anon ou service_role) | 🚨 se service_role |
| `service_role` (qualquer match em src/) | Referência a service role no client | 🚨 |
| `SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']eyJ[^"']+` | Service role hardcoded | 🚨 |
| `VITE_.*SERVICE_ROLE` | Service role com prefixo público (vai pro bundle) | 🚨 |
| `NEXT_PUBLIC_.*SERVICE_ROLE` | Mesmo no Next | 🚨 |
| `supabaseUrl\s*=\s*["']https://[a-z0-9]+\.supabase\.co` | URL Supabase hardcoded fora de env | 🟡 |

**Como diferenciar anon de service_role**: decode o JWT (base64 do meio). Tem `"role":"service_role"` ou `"role":"anon"`.

## Stripe

| Pattern | O que é | Severidade |
|---|---|---|
| `sk_live_[A-Za-z0-9]{24,}` | Secret live | 🚨 |
| `sk_test_[A-Za-z0-9]{24,}` | Secret test | 🟡 (vaza em test) |
| `rk_live_[A-Za-z0-9]{24,}` | Restricted live | 🚨 |
| `whsec_[A-Za-z0-9]{32,}` | Webhook secret | 🚨 |
| `pk_live_[A-Za-z0-9]{24,}` | Publishable live (OK em frontend) | 🔵 |
| `pk_test_[A-Za-z0-9]{24,}` | Publishable test (OK em frontend) | 🔵 |

## AWS

| Pattern | O que é | Severidade |
|---|---|---|
| `AKIA[0-9A-Z]{16}` | AWS Access Key ID (long-term) | 🚨 |
| `ASIA[0-9A-Z]{16}` | AWS Access Key ID (temporário) | 🟡 |
| `aws_secret_access_key\s*=\s*["'][A-Za-z0-9/+=]{40}["']` | Secret access key | 🚨 |
| `arn:aws:iam::\d{12}:` | ARN com account id (info disclosure) | 🟡 |

## Anthropic / OpenAI / Google AI

| Pattern | O que é | Severidade |
|---|---|---|
| `sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{90,}` | Anthropic API key | 🚨 |
| `sk-[A-Za-z0-9]{48,}` | OpenAI API key (legacy) | 🚨 |
| `sk-proj-[A-Za-z0-9_-]{60,}` | OpenAI project key | 🚨 |
| `AIza[0-9A-Za-z_-]{35}` | Google API key | 🚨 |
| `GEMINI_API_KEY\s*=\s*["'][A-Za-z0-9_-]+` | Gemini key hardcoded | 🚨 |

## GitHub / GitLab

| Pattern | O que é | Severidade |
|---|---|---|
| `ghp_[A-Za-z0-9]{36}` | GitHub Personal Access Token | 🚨 |
| `gho_[A-Za-z0-9]{36}` | GitHub OAuth | 🚨 |
| `ghs_[A-Za-z0-9]{36}` | GitHub Server-to-server | 🚨 |
| `github_pat_[A-Za-z0-9_]{82}` | Fine-grained GitHub PAT | 🚨 |
| `glpat-[A-Za-z0-9_-]{20}` | GitLab PAT | 🚨 |

## Cloudflare / Vercel

| Pattern | O que é | Severidade |
|---|---|---|
| `CLOUDFLARE_API_TOKEN\s*=\s*["'][A-Za-z0-9_-]{40,}` | Cloudflare API token | 🚨 |
| `vercel_[a-z0-9]{24}` | Vercel deployment token | 🚨 |
| `VERCEL_TOKEN\s*=\s*["'][A-Za-z0-9]+` | Vercel token | 🚨 |

## Comunicação (Slack, Discord, Twilio, SendGrid)

| Pattern | O que é | Severidade |
|---|---|---|
| `xox[baprs]-[A-Za-z0-9-]{10,48}` | Slack token | 🚨 |
| `https://hooks\.slack\.com/services/[A-Z0-9]{9}/[A-Z0-9]{9}/[A-Za-z0-9]{24}` | Slack webhook | 🚨 |
| `MTA[0-9]{17}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}` | Discord bot token | 🚨 |
| `AC[a-z0-9]{32}` | Twilio Account SID | 🟡 |
| `SK[a-z0-9]{32}` | Twilio API Key SID | 🚨 |
| `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` | SendGrid API key | 🚨 |

## Pagamento (PayPal, Mercado Pago, etc)

| Pattern | O que é | Severidade |
|---|---|---|
| `APP_USR-[0-9a-f-]{36}` | Mercado Pago access token | 🚨 |
| `TEST-[0-9]{16}-[0-9]{6}-[a-f0-9]{32}-[0-9]{9}` | Mercado Pago test token | 🟡 |
| `EAA[A-Z0-9]{40,}` | Facebook/Meta token | 🚨 |

## Genéricos

| Pattern | O que é | Severidade |
|---|---|---|
| `(?i)(api[_-]?key|apikey|access[_-]?token|secret)\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']` | Genérico com palavra-chave | 🟡 |
| `eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}` | JWT genérico | 🟡 |
| `-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----` | Chave privada inline | 🚨 |
| `[a-f0-9]{40}` em var chamada `secret`/`token` | Hex 40-char (SHA-1, etc) | 🟡 |
| `mongodb(\+srv)?://[^:]+:[^@]+@` | Mongo connection string com credencial | 🚨 |
| `postgres(ql)?://[^:]+:[^@]+@[^/]+/` | Postgres URI com password | 🚨 |
| `redis://[^:]+:[^@]+@` | Redis URI com password | 🚨 |

## Convenções `.env`

### `.env.example` correto
```env
# ✅ valores PLACEHOLDER, nunca reais
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here  # backend only
STRIPE_SECRET_KEY=sk_live_xxx
DATABASE_URL=postgresql://user:password@host:5432/db
```

### `.env.example` incorreto (achado comum)
```env
# 🚨 valor real esquecido no example
VITE_SUPABASE_URL=https://xqzpnopkqksmolbhgoph.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Fluxo de remediação por tipo de secret

```
DETECTOU secret X em arquivo F
│
├── X está em src/, dist/, .env (não .example)?
│   ├── SIM → 🚨 Rotacionar imediatamente
│   │       1. Provedor: Settings → revogar/rotacionar key
│   │       2. Atualizar produção (Vercel env, Supabase secrets, etc.)
│   │       3. Remover do código (mover para .env.local + .gitignore)
│   │       4. Verificar histórico git: se está lá, reescrever ou aceitar exposição
│   │
│   └── NÃO (em .env.example/test) → 🟡 Substituir por placeholder
│
└── X também está em git log?
    └── SIM → Reescrita de histórico ou rotacionar e seguir
```

## Ferramentas complementares (sugerir ao usuário)

- **gitleaks** — `brew install gitleaks && gitleaks detect`
- **trufflehog** — varredura mais agressiva, inclui histórico git
- **detect-secrets** (Yelp) — bom para CI
- **GitHub secret scanning** — automático em repos públicos

Sugira hook pre-commit:
```bash
# .husky/pre-commit ou lefthook.yml
gitleaks protect --staged --no-banner
```
