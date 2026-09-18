# CHANGELOG

## [2.2.0] — 2026-09-18

### Removido (breaking para quem invocava por nome)
- `pt-br-translator` e `token-budget-analyst` saíram deste plugin: não têm nada a ver com segurança/custo de SaaS e inflavam a lista de skills. Vivem agora no plugin **`pt-br-utils`** (mesmo marketplace). Instale-o se usava alguma das duas.
- `saas-shield-br/.claude-plugin/marketplace.json` (sobra de quando o plugin era o próprio marketplace). O `claude plugin validate saas-shield-br` validava esse arquivo em vez do `plugin.json`.

### Corrigido
- **Convention-driven de fato**: `edge-function-guard`, `schema-diff`, `/new-migration` e o hook `check-sql-antipattern.mjs` ainda falavam em `company_id`/`force_company_id`/"padrão MarginPro". Agora usam `<TC>`/`R`/`WP` da skill `tenant-model`; o hook reconhece `company_id|unit_id|organization_id|org_id|tenant_id|account_id|workspace_id` e avisa sobre falta de FORCE RLS/`CREATE POLICY` em vez de exigir trigger `force_company_id` (que só existe no arquétipo A).
- Hook pré-commit: a regex de chave OpenAI (`sk-…`) batia também nas chaves Anthropic (`sk-ant-…`), duplicando o achado. Agora exclui `sk-ant-`.
- `vercel-deploy-guard`: a configuração modelo de `vercel.json` divergia da que o `devops-ci` (saas-builder-br) gera (bun × npm, rewrite `/(.*)` que engolia `/api` e `/assets`, sem CSP, `regions` fixo). Unificada; esta skill é a fonte canônica e o builder copia.
- `edge-function-guard`: template marcado como canônico (`Deno.serve` + `jsr:@supabase/supabase-js@2`); `backend-supabase`, `llm-multi-provider` e `whatsapp-zapi-integracao` do builder passaram a segui-lo.

### Alterado
- `multi-tenant-auditor` deixa de anunciar gatilhos de usuário ("audita esse SaaS", "vaza dados entre tenants?") que competiam com o agente `tenant-isolation-auditor`. É base de conhecimento pré-carregada via `skills:`; a descrição encaminha os pedidos ao agente/`/audit-tenant`.

## [2.1.1] — 2026-09-17

### Corrigido
- Frontmatter YAML inválido em `identity-access-auditor` e `multi-tenant-auditor` (`: ` sem aspas na descrição). O Claude Code descartava o frontmatter inteiro: o agente carregava sem descrição, com todas as ferramentas e sem as skills pré-carregadas.

## [2.1.0] — 2026-09-17

### Alterado
- **`cost-optimizer` passa a cuidar só da fatura** (egress, invocações, Realtime, storage, bandwidth, build minutes). Saíram os gatilhos e o diagnóstico de performance ("queries lentas", "otimização de performance", EXPLAIN, índices/RLS lenta, N+1), que duplicavam as skills `db-perf` e `frontend-perf` do plugin `turbo` (e não tinham o ajuste `(SELECT fn())` para RLS). A skill agora encaminha lentidão ao `turbo`.
- `cost-optimizer` deixa de assumir `company_id`: usa `<TC>` resolvido pela skill `tenant-model`, como o resto da v2.

## [2.0.0] — 2026-07-22

### Convention-driven (breaking)
- O plugin **não assume mais `company_id`**. Nova skill **`tenant-model`** (fonte única da verdade): spec do `.claude/tenancy-profile.yml`, detecção automática, invariantes universais e **4 arquétipos de tenant** (A `company_id`/JWT/force-trigger, B `unit_id`/membership, C `org+unit`/RBAC, D `unit_id`/set). Suporta Next.js App Router, Vite e monorepo — não só Vite.
- Nova skill **`agent-result-contract`**: contrato de saída único de todos os auditores (veredito PASS/PASS_WITH_WARNINGS/FAIL/INCONCLUSIVE, severidade P0–P3, regras de evidência, anti-desonestidade).
- `rls-reviewer`, `multi-tenant-auditor` e `supabase-migrator` **parametrizados** pelo profile (coluna de tenant, resolver, `write_path`). O checklist não penaliza mais a ausência de `force_company_id` fora do arquétipo A.

### Agentes
- **Removido** `tenant-leak-hunter` → fundido no novo **`tenant-isolation-auditor`** (usa a skill `multi-tenant-auditor` como conhecimento).
- **Novos** `identity-access-auditor` (memberships/RBAC/convites/troca de tenant/super admin/anti-lockout) e `integration-reliability-auditor` (webhooks/filas/idempotência/dedup/APIs externas).
- Todos os agentes: pré-carregam skills via `skills:`, adotam o contrato, ganham `maxTurns`/`effort`, e são **honestos sobre análise estática** (emitem comandos de execução como próxima ação em vez de fingir que rodaram). `secret-hunter` e `migration-validator` deixam explícito o modo estático + deep.

### Comandos & manifesto
- `/audit-tenant`, `/check-rls`, `/pre-deploy` migrados de `Task` para `Agent`, resolvem o profile e usam os novos agentes; `/pre-deploy` agora inclui etapas de identidade e integrações.
- `homepage` corrigida para `moralles-filmes/claude-plugins`. Descrição/keywords atualizadas (convention-driven, multi-framework). 12 skills, 6 subagents.
- `scripts/validate.mjs` endurecido (nomes únicos, `skills:` referenciadas existem, filename↔name, detecção de `Task`/refs a agentes removidos).

## [1.0.0] — 2026-04-29

### Adicionado
- Skill `rls-reviewer` com checklist de 24 itens e detecção de 12 anti-patterns RLS
- Skill `multi-tenant-auditor` que valida o modelo de 4 camadas (column + resolver + trigger + RLS)
- Skill `secret-scanner` com 30+ regex patterns (Stripe, AWS, Supabase, OpenAI, Anthropic, GitHub, etc.)
- Skill `supabase-migrator` com 6 templates (CRUD table, junction, audit log, soft delete, materialized view, function)
- Skill `edge-function-guard` com checklist de auth/CORS/error/rate-limit
- Skill `cost-optimizer` com diagnóstico EXPLAIN ANALYZE e índices RLS-aware
- Skill `schema-diff` que compara migrations locais vs schema remoto
- Skill `vercel-deploy-guard` com pré-deploy checklist e headers de segurança
- Skill `pt-br-translator` com 50+ correções idiomáticas comuns em UI
- Skill `token-budget-analyst` com guia de otimização de prompts/contexto
- 4 subagents: `rls-auditor`, `tenant-leak-hunter`, `secret-hunter`, `migration-validator`
- 5 slash commands: `/audit-tenant`, `/check-rls`, `/secret-scan`, `/pre-deploy`, `/new-migration`
- 2 hooks: pré-edit em `*.sql` e pré-commit `git commit`
