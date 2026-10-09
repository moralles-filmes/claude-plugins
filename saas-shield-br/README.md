# saas-shield-br

> Plugin Claude Code para devs brasileiros que constroem SaaS multi-tenant em Supabase + Vercel. **Convention-driven**: não assume `company_id` — lê o `tenancy-profile` do projeto e funciona em **Next.js App Router, Vite ou monorepo**, com 5 arquétipos de tenant. Foco em **segurança** (RLS, isolamento de tenant, identidade/acesso, integrações, secrets), **custo** e **padrões PT-BR**.

## O modelo convention-driven (v2)

O plugin **não** tem um esquema de tenant fixo. Antes de auditar ou gerar, ele resolve a convenção do projeto a partir de `.claude/tenancy-profile.yml` (ou detecta). Os invariantes de segurança são universais; o que varia (coluna de tenant, resolver, caminho de escrita, framework) é **parâmetro**. Arquétipos suportados:

| Arquétipo | Tenant | Resolver | Escrita |
|---|---|---|---|
| **A** | `company_id` | JWT claim (`get_current_company_id`) | trigger `force_company_id` |
| **B** | `unit_id` (org→unit→member) | membership-lookup (`is_unit_member`) | server-scoped |
| **C** | `organization_id`+`unit_id` | RBAC (`has_permission`) | RPC `SECURITY DEFINER` |
| **D** | `unit_id` | set-returning (`current_unit_ids`) + `app.has_role` | server-scoped |
| **E** (padrão para projeto novo) | `company_id` + `location_id` (filial) | set-returning (`private.allowed_company_ids`/`allowed_location_ids` por permissão `<modulo>.<submodulo>.<acao>`); empresa ativa da URL, confirmada pela membership | server-scoped + transição crítica por RPC |

O arquétipo E é o do plugin **`padrao-saas`** (v3.2). Projeto com `docs/standards/` tem as normas do projeto (DATABASE, MULTI_TENANCY, ACCESS_CONTROL) como régua: elas prevalecem sobre os templates daqui. A–D ficam para projetos existentes.

A skill **`tenant-model`** é a fonte única da verdade (spec do profile + detecção + arquétipos). A skill **`agent-result-contract`** define o formato de saída único de todos os auditores.

## O que está dentro

### 10 Skills

| Skill | Categoria | O que faz |
|---|---|---|
| `tenant-model` | Fundação | Fonte da verdade de tenancy — spec do `tenancy-profile`, detecção, invariantes universais, 5 arquétipos |
| `agent-result-contract` | Fundação | Contrato único de saída dos auditores (veredito PASS/FAIL/INCONCLUSIVE, severidade P0–P3, regras de evidência) |
| `rls-reviewer` | Segurança | Audita RLS parametrizado pelo profile — `FORCE RLS`, `USING`+`WITH CHECK`, `SECURITY DEFINER`+`search_path`, 12 anti-patterns |
| `multi-tenant-auditor` | Segurança | Isolamento no repo inteiro — tabelas órfãs, fronteira privilegiada, views, leak detection (base do tenant-isolation-auditor) |
| `secret-scanner` | Segurança | Detecta secrets vazados — `service_role` no cliente, `.env` commitado, keys hardcoded, `VITE_`/`NEXT_PUBLIC_` abuse |
| `supabase-migrator` | Backend | **Gerador único de migration** dos plugins — arquétipo E por padrão (helpers `private.*`, `search_path = ''`, FORCE RLS, grants explícitos, FK composta, transição por RPC); A–D como notas para legado |
| `edge-function-guard` | Backend | Revisa Edge Functions e traz o **template canônico** — usuário validado no Auth, empresa ativa por `x-company-id` confirmada pela membership, `can()` sobre `my_permissions`, erro sem vazamento, `Deno.env` só no entrypoint |
| `cost-optimizer` | Custo | Reduz a conta Supabase/Vercel — egress, invocações, Realtime, storage, bandwidth, build. Lentidão/performance fica com o plugin `turbo` |
| `schema-diff` | DevOps | Drift entre migrations locais ↔ remoto |
| `vercel-deploy-guard` | DevOps | Pré-deploy — env vars, headers (CSP/HSTS), source maps, bundle limit. Fonte única do `vercel.json` (Vite e Next); o `devops-ci` do saas-builder-br referencia esta skill |

> `pt-br-translator` (revisão de strings PT-BR) e `token-budget-analyst` (custo de tokens) mudaram para o plugin **`pt-br-utils`** na v2.2.0.

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
- `/new-migration [descrição]` — conduz a skill `supabase-migrator`; próximos passos sempre locais (`supabase db reset`, `supabase test db`). `db push` no remoto só depois do merge, com autorização explícita

### Hooks

Todos com `command: "node"` + `args` (sem shell; path com espaço funciona) e `timeout`.

- **PreToolUse** em `Write|Edit` de `migrations/*.sql` — avalia o arquivo **como vai ficar** (no Edit, aplica `old_string → new_string` sobre o arquivo atual) e bloqueia o que a mudança introduz: tabela em `public` sem RLS, RLS sem FORCE, `disable row level security`, `using (true)`/`with check (true)`, `security definer` sem `search_path` (em qualquer ordem de cláusula). Avisos (search_path ≠ `''`, tabela sem policy ou sem revoke de `anon`) vão para o contexto do Claude.
- **PreToolUse** em `Bash|PowerShell` com `git` (filtro `if`) — em `git commit`, inclusive em comando composto (`git add -A && git commit`, `git -C dir commit`, `cd x; git commit`, `bash -c`), varre o índice, o que um `git add` anterior no mesmo comando vai adicionar e o working tree em `commit -a`. Lista de padrões: `hooks/scripts/secret-patterns.mjs` (fonte única; documentada no `patterns.md` do `secret-scanner`). JWT só bloqueia com `role: service_role`; `sb_secret_` bloqueia, `sb_publishable_` passa.
- **PostToolUse** em `Write|Edit` de `supabase/migrations/*.sql` — sugere `/check-rls` e lembra que aplicar é local.

Testes dos hooks (Node 18+, sem dependências), na raiz do marketplace:

```bash
node --test saas-shield-br/tests/*.test.mjs
```

## O `tenancy-profile` do projeto

Coloque em `.claude/tenancy-profile.yml` do repo (ou deixe o plugin detectar). Projeto novo usa o do `padrao-saas:aplicar` (arquétipo E); resumo:

```yaml
archetype: E                 # A | B | C | D | E
framework: next-app          # next-app | vite | monorepo
tenant:
  columns: [company_id]
  resolver: private.user_company_ids
  resolver_kind: set         # set | membership-lookup | jwt-claim
  write_path: server-scoped  # server-scoped | rpc-security-definer | force-trigger
  active_source: url         # empresa ativa vem da URL; o servidor confirma a membership
locations: { enabled: true, column: location_id, table: locations }
membership: { model: multi, table: company_members, owner_flag: is_owner }
roles: { model: permission-strings, catalog_table: permissions }
super_admin: { authority: platform_admins, fn: private.is_platform_admin }
secrets_boundary: route-handler
client_env_prefix: NEXT_PUBLIC_
rls_helper_namespace: private
display_term: Empresa
```

Projeto existente declara o arquétipo que já usa (A–D); a spec completa está na skill `tenant-model`.

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

Versão atual: **2.4.0** — ver [CHANGELOG.md](./CHANGELOG.md). A v2 é convention-driven e **breaking** vs. a v1 (agente `tenant-leak-hunter` fundido em `tenant-isolation-auditor`, contrato de saída novo, não assume mais `company_id`).

## Licença

MIT.
