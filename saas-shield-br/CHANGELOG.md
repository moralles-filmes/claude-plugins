# CHANGELOG

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
