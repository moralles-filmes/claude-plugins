# Secret Scanner — Patterns

Padrões organizados por provedor. Severidade: 🚨 = expôs key real | 🟡 = padrão suspeito | 🔵 = informativo.

## Lista do hook pré-commit (fonte única)

O hook `pre-commit-secret-scan.mjs` (commit e push), o hook das ferramentas MCP do GitHub e o CLI `scripts/security/secret-scan.mjs` (staged, histórico, commits que vão sair) usam a lista de **`scripts/security/secret-patterns.mjs`**. Aquele módulo é a lista canônica: não copie as regex para outro lugar. Para incluir um padrão, adicione lá, documente o `id` aqui e escreva o teste que deve reprovar (o teste `tests/secret-scan.test.mjs` confere a documentação).

Só entra no hook o que é incidente num commit. O resto desta página é para o `$saas-shield-br:secret-scan`.

| `id` | O que bloqueia | Observação |
|---|---|---|
| `supabase-service-role-jwt` | JWT legado do Supabase com `"role":"service_role"` e `iss` do Supabase | O hook decodifica o payload (base64url do segmento do meio). JWT `anon` passa; a chave demo do `supabase start` (`"iss":"supabase-demo"`) é pública e passa |
| `supabase-secret-key` | Chave nova `sb_secret_…` | `sb_publishable_…` é pública e passa |
| `supabase-personal-access-token` | `sbp_…` (token da CLI/Management API) | Dá acesso à conta inteira, não só a um projeto |
| `stripe-live-secret` | `sk_live_…` | |
| `stripe-live-restricted` | `rk_live_…` | |
| `stripe-webhook-secret` | `whsec_…` | |
| `aws-access-key-id` | `AKIA…` (16 caracteres) | Ignora os exemplos da documentação da AWS (terminados em `EXAMPLE`) |
| `anthropic-api-key` | `sk-ant-api…` / `sk-ant-admin…` | |
| `openai-api-key` | `sk-…`, `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…` (40+ caracteres) | Exclui `sk-ant-` para não contar a chave Anthropic duas vezes |
| `deepseek-api-key` | `sk-` + 32 hexadecimais | Não colide com a OpenAI (tamanho diferente) |
| `google-api-key` | `AIza…` (Gemini, Maps, Firebase) | Chave de navegador do Maps também casa: restrinja por domínio no console e mantenha fora do Git |
| `meta-access-token` | `EAA…` (WhatsApp Cloud API, Graph API) | Não casa dentro de base64 (precisa estar isolado) |
| `database-url-with-password` | `postgres://usuario:senha@host`, mysql, mongodb, redis, amqp | Senha de exemplo (`password`, `senha`, `postgres`, `${VAR}`, `<…>`) e host local (`localhost`, `127.0.0.1`, `db`) passam |
| `npm-access-token` | `npm_…` | Token de publicação: quem tem publica versão com malware no seu nome |
| `github-token` | `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_` | |
| `github-fine-grained-pat` | `github_pat_…` | |
| `slack-token` | `xoxb-`, `xoxa-`, `xoxp-`, `xoxr-`, `xoxs-` | |
| `private-key-block` | `-----BEGIN … PRIVATE KEY-----` | |
| `env-file-versionado` | Arquivo `.env*` (fora `.example`/`.sample`/`.template`) com qualquer valor que não seja público | Regra em `scripts/security/env-public.mjs`, abaixo. Pega segredo sem formato conhecido (token da Z-API, da Vercel, senha) |

O hook varre o índice (`git cat-file --batch`), os arquivos que um `git add` anterior no mesmo comando vai adicionar e o working tree em `commit -a`/pathspec. No `git push`, varre os commits de `HEAD` que ainda não estão em nenhum remoto, o que cobre merge, cherry-pick e commit feito fora do Claude. A mensagem mostra só os primeiros caracteres do match. Falso-positivo: marque a linha com `secret-scan: ignore` ou registre em `.secret-scan-allow.json` (`file`, `id`, `commit` opcional, `reason` obrigatório).

### Quando um `.env` versionado é aceitável

Só `.env.example`/`.env.sample`/`.env.template` (documentação, sem valor real) ou um `.env*` em que **todas** as linhas são comentário, vazias ou `PREFIXO_PUBLICO_NOME=valor`, com prefixo que o framework já põe no bundle do navegador (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `EXPO_PUBLIC_`, `REACT_APP_`, `NUXT_PUBLIC_`, `GATSBY_`), sem nome com cara de segredo (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `SERVICE_ROLE`, `AUTH`, `DSN`…) e sem valor com formato de segredo (JWT, `sk-`, `AIza`, `sb_secret_`, PEM, URL com usuário:senha). Até 16 KB, uma linha por valor.

A anon key do Supabase em JWT continua bloqueando: pelo formato não dá para separar anon de service_role, e um `.env` versionado não deve depender de decodificar. Coloque a anon/publishable key na Vercel, não no Git. É a mesma regra do gate do `ai-router-br` (`lib/security.mjs`, `publicEnvFile`), testada com os mesmos casos.

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
VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co   # ref real do projeto
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Fluxo de remediação por tipo de secret

O passo a passo está em [`rotation-runbook.md`](./rotation-runbook.md). Resumo da ordem, que não muda:

```
DETECTOU secret X (código, .env, bundle ou histórico)
│
├── 1. Contenha no provedor: revogue/rotacione X e emita outra   ← SEMPRE primeiro
├── 2. Troque em todos os ambientes (Vercel, Supabase, CI, workers, apps) e faça deploy
├── 3. Prove que X morreu: requisição com X → 401/403
├── 4. Investigue o período exposto (desde quando, logs do provedor, forks)
├── 5. Remova do código atual (env no servidor; .env fora do Git)
└── 6. Histórico: só depois, e só se o usuário decidir. Em repo público, X já é pública
```

Em `.env.example`/teste com valor que parece real: substitua por placeholder e confirme com o usuário se é real; se for, siga a ordem acima.

## Ferramentas complementares

- **`scripts/security/secret-scan.mjs`** (deste plugin, sem dependências) — `--history` (todas as refs), `--range A..B`, `--outgoing`, `--staged`. É o que o `$saas-shield-br:secret-scan` executa.
- **gitleaks** — `gitleaks git . --log-opts="--all" --redact` (v8.19+; versões antigas: `gitleaks detect --source . --redact`, que também varre o histórico).
- **trufflehog** — `trufflehog git file://. --results=verified,unknown`. Não use `--only-verified` sozinho: chave revogada ou de provedor sem verificador some do relatório.
- **GitHub secret scanning + push protection** — ligue em Settings → Code security (automático em repo público só para os parceiros do GitHub).

Hook pre-commit para quem commita fora do Claude (terminal, IDE, Codex): o kit do `padrao-saas` instala `.githooks/pre-commit` e `.githooks/pre-push` chamando `node scripts/security/secret-scan.mjs --staged` / `--outgoing`.
