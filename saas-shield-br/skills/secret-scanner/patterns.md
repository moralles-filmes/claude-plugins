# Secret Scanner — Patterns

Padrões organizados por provedor. Severidade: 🚨 = expôs key real | 🟡 = padrão suspeito | 🔵 = informativo.

## Lista do hook pré-commit (fonte única)

O hook `pre-commit-secret-scan.mjs` bloqueia o `git commit` com a lista de **`hooks/scripts/secret-patterns.mjs`**. Aquele módulo é a lista canônica do hook: não copie as regex para outro lugar. Para incluir um padrão, adicione lá e documente o `id` aqui (o teste `tests/secret-scan.test.mjs` confere).

Só entra no hook o que é incidente num commit. O resto desta página é para o `/secret-scan`.

| `id` | O que bloqueia | Observação |
|---|---|---|
| `supabase-service-role-jwt` | JWT legado do Supabase com `"role":"service_role"` e `iss` do Supabase | O hook decodifica o payload (base64url do segmento do meio). JWT `anon` passa; a chave demo do `supabase start` (`"iss":"supabase-demo"`) é pública e passa |
| `supabase-secret-key` | Chave nova `sb_secret_…` | `sb_publishable_…` é pública e passa |
| `stripe-live-secret` | `sk_live_…` | |
| `stripe-live-restricted` | `rk_live_…` | |
| `stripe-webhook-secret` | `whsec_…` | |
| `aws-access-key-id` | `AKIA…` (16 caracteres) | Ignora os exemplos da documentação da AWS (terminados em `EXAMPLE`) |
| `anthropic-api-key` | `sk-ant-api…` / `sk-ant-admin…` | |
| `openai-api-key` | `sk-…`, `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…` | Exclui `sk-ant-` para não contar a chave Anthropic duas vezes |
| `github-token` | `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_` | |
| `github-fine-grained-pat` | `github_pat_…` | |
| `slack-token` | `xoxb-`, `xoxa-`, `xoxp-`, `xoxr-`, `xoxs-` | |
| `private-key-block` | `-----BEGIN … PRIVATE KEY-----` | |

O hook varre o índice (`git cat-file --batch`), os arquivos que um `git add` anterior no mesmo comando vai adicionar e o working tree em `commit -a`/pathspec. A mensagem mostra só os primeiros caracteres do match.

## Supabase

| Pattern | O que é | Severidade |
|---|---|---|
| `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` | JWT (anon, service_role ou de usuário) | 🚨 só se o payload tiver `"role":"service_role"` |
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS[^"]{40,}` | Grep mais estreito: JWT HS256 com `"iss":"supabase"` | 🚨 se service_role |
| `sb_secret_[A-Za-z0-9_-]{20,}` | Secret key nova do Supabase (substitui a service_role) | 🚨 |
| `sb_publishable_[A-Za-z0-9_-]{20,}` | Publishable key nova (substitui a anon) | 🔵 (pode ir ao browser) |
| `service_role` (qualquer match em src/) | Referência a service role no client | 🚨 |
| `SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']eyJ[^"']+` | Service role hardcoded | 🚨 |
| `VITE_.*SERVICE_ROLE` | Service role com prefixo público (vai pro bundle) | 🚨 |
| `NEXT_PUBLIC_.*SERVICE_ROLE` | Mesmo no Next | 🚨 |
| `supabaseUrl\s*=\s*["']https://[a-z0-9]+\.supabase\.co` | URL Supabase hardcoded fora de env | 🟡 |

**Como diferenciar anon de service_role**: decode o segmento do meio do JWT (base64url). Tem `"role":"service_role"` ou `"role":"anon"`. Para as chaves novas, o prefixo já diz: `sb_secret_` nunca sai do servidor; `sb_publishable_` pode ir ao cliente.

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
VITE_SUPABASE_ANON_KEY=your-anon-key-here            # ou a publishable key (sb_publishable_…)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here  # backend only (ou sb_secret_…)
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
