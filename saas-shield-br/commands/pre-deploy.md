---
description: Checklist completo antes de fazer deploy — orquestra secrets + isolamento + identidade + integrações + schema-diff + rls + vercel guards
argument-hint: "[opcional: 'staging' ou 'production' — default production]"
---

Rode checklist completo de pré-deploy.

## Antes de tudo — resolva o profile

Carregue a skill `tenant-model` e leia `.claude/tenancy-profile.yml` (ou detecte). Passe o profile resolvido para cada agente/skill abaixo. **Não assuma `company_id`.**

## Como proceder

Execute **em ordem**, parando no primeiro bloqueante crítico (falha rápida):

### Etapa 1 — Secrets
Dispare o agente `secret-hunter` (Agent tool). Se houver crítico (P0):
- **PARE** — rotacione antes de qualquer outra coisa. Não prossiga até `PASS`.

### Etapa 2 — Isolamento multi-tenant
Dispare o agente `tenant-isolation-auditor` (Agent tool). Se P0/P1 → bloqueie o deploy e liste fixes priorizados com cenário de exploração.

### Etapa 3 — Identidade & acesso
Dispare o agente `identity-access-auditor` (Agent tool): memberships, RBAC, convites, troca de tenant, super admin, anti-lockout. Escalonamento de privilégio = bloqueante.

### Etapa 4 — Integrações (se houver webhook/fila/API externa)
Dispare o agente `integration-reliability-auditor` (Agent tool): assinatura de webhook, idempotência, dedup, claim de fila, retry. Webhook sem assinatura ou confiando no tenant do body = bloqueante.

### Etapa 5 — Schema diff
Invoque a skill `schema-diff`. Tabela no remoto sem migration local → bloqueio; policies divergentes → confirme a fonte da verdade.

### Etapa 6 — RLS nas migrations recentes
Invoque a skill `rls-reviewer` (parametrizada) nas migrations dos últimos 30 dias. Sumarize.

### Etapa 7 — Vercel guard
Invoque a skill `vercel-deploy-guard`: headers de segurança, env segregada (Production vs Preview), source maps off, bundle size.

### Etapa 8 — Edge functions (se houver)
Invoque a skill `edge-function-guard` em cada função em `supabase/functions/*`.

## Saída final consolidada

```
🚀 PRE-DEPLOY — <staging|production>  | Arquétipo: <A|B|C|D>

1. 🔐 Secrets:            <PASS|FAIL>
2. 🛡️ Isolamento tenant:  <PASS|FAIL>
3. 👤 Identidade/acesso:  <PASS|FAIL>
4. 🔌 Integrações:        <PASS|FAIL|N/A>
5. 🔄 Schema diff:        <PASS|FAIL>
6. 📋 RLS reviews:        <PASS|FAIL>
7. 🚀 Vercel config:      <PASS|FAIL>
8. ⚡ Edge functions:     <PASS|FAIL|N/A>

🎯 Veredito: DEPLOY APROVADO | BLOQUEADO POR <N> ITENS
🚨 Bloqueantes: <lista priorizada>
🟡 Atenções: <lista>

📋 Próximos passos:
  Se aprovado: tag de release → aplicar migrations → deploy → smoke test → monitorar logos 30min
  Se bloqueado: resolver bloqueantes em ordem → re-rodar /pre-deploy
```

## Entrada do usuário

`$ARGUMENTS` — `staging` ou `production`. Em staging, atenções podem ser toleradas; em production, atenções acima de 3 viram bloqueantes.
