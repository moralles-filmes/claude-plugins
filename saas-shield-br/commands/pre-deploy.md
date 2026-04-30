---
description: Checklist completo antes de fazer deploy — orquestra rls + multi-tenant + secret + schema-diff + vercel guards
argument-hint: "[opcional: 'staging' ou 'production' — default production]"
---

Rode checklist completo de pré-deploy.

## Como proceder

Execute as verificações **em ordem**, parando no primeiro bloqueante crítico:

### Etapa 1 — Secrets (5min)
Invoque o subagent `secret-hunter`. Se 🚨 críticos detectados:
- **PARE** — rotacione antes de qualquer outra coisa
- Não prossiga até secret-hunter retornar CLEAN

### Etapa 2 — Multi-tenant (10min)
Invoque a skill `multi-tenant-auditor`. Se 🚨 críticos:
- Bloqueie deploy
- Invoque `tenant-leak-hunter` para vetores específicos
- Liste fixes priorizados

### Etapa 3 — Schema diff (5min)
Invoque a skill `schema-diff`. Confira:
- Se há tabelas no remoto sem migration local → bloqueio
- Se há policies divergentes → confirme com usuário qual é a verdade

### Etapa 4 — RLS review nas migrations recentes (5min)
Invoque a skill `rls-reviewer` em todas migrations dos últimos 30 dias. Sumarize.

### Etapa 5 — Vercel guard (5min)
Invoque a skill `vercel-deploy-guard`:
- Headers de segurança
- Env vars segregadas (Production vs Preview)
- Source maps off
- Bundle size dentro de limite

### Etapa 6 — Edge functions (se houver) (5min)
Invoque a skill `edge-function-guard` em cada função em `supabase/functions/*`.

## Saída final consolidada

```
🚀 PRE-DEPLOY CHECKLIST — <staging|production>
Data: <data>

═══════════════════════════════════════════
1. 🔐 Secrets:           <PASS | FAIL>
2. 🛡️ Multi-tenant:     <PASS | FAIL>
3. 🔄 Schema diff:        <PASS | FAIL>
4. 📋 RLS reviews:        <PASS | FAIL>
5. 🚀 Vercel config:      <PASS | FAIL>
6. ⚡ Edge functions:     <PASS | FAIL>

═══════════════════════════════════════════
🎯 Veredito: <DEPLOY APROVADO | BLOQUEADO POR <N> ITENS>

🚨 Bloqueantes:
  <lista consolidada com priority>

🟡 Atenções:
  <lista — não bloqueante mas vale resolver>

═══════════════════════════════════════════
📋 Próximos passos:

Se aprovado:
  1. Tag de release (ex: git tag v0.42.0)
  2. supabase db push --linked
  3. vercel deploy --prod
  4. Smoke test (5min)
  5. Monitor logs por 30min

Se bloqueado:
  1. Resolver bloqueantes em ordem
  2. Re-rodar /pre-deploy
```

## Entrada do usuário

`$ARGUMENTS` — `staging` ou `production` (afeta severity threshold).

Em staging, atenções podem ser ignoradas. Em production, atenções viram bloqueantes acima de 3 unidades.
