# saas-shield-br

> Plugin Claude Code para devs brasileiros que constroem SaaS multi-tenant em Supabase + Vercel. **Convention-driven**: não assume `company_id` — lê o `tenancy-profile` do projeto e funciona em **Next.js App Router, Vite ou monorepo**, com 4 arquétipos de tenant. Foco em **segurança** (RLS, isolamento de tenant, identidade/acesso, integrações, secrets), **custo** e **padrões PT-BR**.

## O modelo convention-driven (v2)

O plugin **não** tem um esquema de tenant fixo. Antes de auditar ou gerar, ele resolve a convenção do projeto a partir de `.claude/tenancy-profile.yml` (ou detecta). Os invariantes de segurança são universais; o que varia (coluna de tenant, resolver, caminho de escrita, framework) é **parâmetro**. Arquétipos suportados:

| Arquétipo | Tenant | Resolver | Escrita |
|---|---|---|---|
| **A** | `company_id` | JWT claim (`get_current_company_id`) | trigger `force_company_id` |
| **B** | `unit_id` (org→unit→member) | membership-lookup (`is_unit_member`) | server-scoped |
| **C** | `organization_id`+`unit_id` | RBAC (`has_permission`) | RPC `SECURITY DEFINER` |
| **D** | `unit_id` | set-returning (`current_unit_ids`) + `app.has_role` | server-scoped |

A skill **`tenant-model`** é a fonte única da verdade (spec do profile + detecção + arquétipos). A skill **`agent-result-contract`** define o formato de saída único de todos os auditores.

## O que está dentro

### 12 Skills

| Skill | Categoria | O que faz |
|---|---|---|
| `tenant-model` | Fundação | Fonte da verdade de tenancy — spec do `tenancy-profile`, detecção, invariantes universais, 4 arquétipos |
| `agent-result-contract` | Fundação | Contrato único de saída dos auditores (veredito PASS/FAIL/INCONCLUSIVE, severidade P0–P3, regras de evidência) |
| `rls-reviewer` | Segurança | Audita RLS parametrizado pelo profile — `FORCE RLS`, `USING`+`WITH CHECK`, `SECURITY DEFINER`+`search_path`, 12 anti-patterns |
| `multi-tenant-auditor` | Segurança | Isolamento no repo inteiro — tabelas órfãs, fronteira privilegiada, views, leak detection (base do tenant-isolation-auditor) |
| `secret-scanner` | Segurança | Detecta secrets vazados — `service_role` no cliente, `.env` commitado, keys hardcoded, `VITE_`/`NEXT_PUBLIC_` abuse |
| `supabase-migrator` | Backend | Gera migrations seguras no **arquétipo do projeto** — timestamp, idempotência, FORCE RLS, policies |
| `edge-function-guard` | Backend | Revisa Edge Functions — JWT, CORS, error leakage, rate limiting, auth header |
| `cost-optimizer` | Performance | Reduz custo Supabase/Vercel — índices RLS-aware, STABLE caching, N+1, realtime, bundle |
| `schema-diff` | DevOps | Drift entre migrations locais ↔ remoto |
| `vercel-deploy-guard` | DevOps | Pré-deploy — env vars, headers (CSP/HSTS), source maps, bundle limit |
| `pt-br-translator` | UX | Revisa UI strings PT-BR — gênero, formalidade, idiomáticos, formato BR |
| `token-budget-analyst` | Workflow | Otimiza prompts/contexto Claude |

### 6 Subagents auditores

Todos read-only (`Read, Grep, Glob`), com `maxTurns`/`effort`, pré-carregando as skills de conhecimento via `skills:` e reportando no `agent-result-contract`. Análise **estática** — comandos de execução são emitidos como próxima ação, nunca reportados como executados.

| Agent | Quando usar |
|---|---|
| `rls-auditor` | Auditoria isolada e profunda de RLS num PR ou migration |
| `tenant-isolation-auditor` | Caça vazamentos cross-tenant no repo (funde o antigo tenant-leak-hunter + execução do multi-tenant-auditor) |
| `identity-access-auditor` | Memberships, RBAC, convites, troca de tenant, super admin, anti-lockout, escalonamento de privilégio |
| `integration-reliability-auditor` | Webhooks (assinatura), filas (claim/retry), idempotência, dedup, APIs externas |
| `secret-hunter` | Varredura estática de secrets (código + `.env` + bundle); emite comandos de deep-scan (git/gitleaks) |
| `migration-validator` | Valida migration antes de aplicar (RLS + tenant + idempotência + reversibilidade + compatibilidade) |

### 5 Slash Commands

- `/audit-tenant` — resolve o profile e dispara o `tenant-isolation-auditor`
- `/check-rls [arquivo]` — revisa RLS (parametrizado) num arquivo ou nas migrations recentes
- `/secret-scan` — scan de secrets (estático + comandos de histórico git)
- `/pre-deploy` — checklist: secrets → isolamento → identidade → integrações → schema → RLS → Vercel → edge functions
- `/new-migration [descrição]` — gera migration no arquétipo do projeto

### Hooks

- **PreToolUse** em `Write|Edit` para `*.sql` — checa anti-patterns
- **PreToolUse** em `Bash` no `git commit` — roda secret-scan antes de permitir

## O `tenancy-profile` do projeto

Coloque em `.claude/tenancy-profile.yml` do repo (ou deixe o plugin detectar):

```yaml
framework: next-app          # vite | next-app | monorepo | expo | fastify
tenant:
  columns: [unit_id]
  resolver: current_unit_ids
  resolver_kind: set         # jwt-claim | membership-lookup | set
  force_trigger: false
  write_path: server-scoped  # force-trigger | server-scoped | rpc-security-definer
membership: { model: multi, table: user_unit_roles }
roles: { model: numeric-levels }
super_admin: { authority: user_profiles.is_super_admin, fn: is_super_admin }
secrets_boundary: route-handler
client_env_prefix: NEXT_PUBLIC_
display_term: Unidade
```

## Instalação

```bash
# adiciona o marketplace local (uma vez) e instala
claude plugin marketplace add /caminho/para/claude-plugins
claude plugin install saas-shield-br
```

## Filosofia

- **Convention over hardcode.** Um plugin que só serve para `company_id` audita errado 3 em cada 4 projetos reais. Este lê a convenção primeiro.
- **Falha cedo, falha alto.** Leak cross-tenant é incidente, não warning.
- **Honestidade de capacidade.** Auditor read-only não afirma ter rodado `git log`/`db reset` — ele emite o comando.
- **PT-BR e token economy** embutidos (`reference.md` sob demanda).

## Versionamento

Versão atual: **2.0.0** — ver [CHANGELOG.md](./CHANGELOG.md). A v2 é convention-driven e **breaking** vs. a v1 (agente `tenant-leak-hunter` fundido em `tenant-isolation-auditor`, contrato de saída novo, não assume mais `company_id`).

## Licença

MIT.
