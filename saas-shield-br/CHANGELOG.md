# CHANGELOG

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
