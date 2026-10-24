---
name: pre-deploy
description: "Checklist completo antes de fazer deploy — orquestra dependências/runtime + secrets (inclusive histórico git) + isolamento + identidade + integrações + schema-diff + rls + vercel guards. Use quando o usuário pedir (equivale ao comando /pre-deploy do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill — formato `[opcional: 'staging' ou 'production' — default production]`.

Rode checklist completo de pré-deploy.

## Antes de tudo — resolva o profile

Carregue a skill `tenant-model` e leia `.claude/tenancy-profile.yml` (ou detecte). Passe o profile resolvido para cada agente/skill abaixo. **Não assuma `company_id`.**

## Como proceder

Execute **em ordem**, parando no primeiro bloqueante crítico (falha rápida):

### Etapa 0 — Dependências e runtime
Invoque a skill `dependency-audit` (ela executa `<plugin-root>/scripts/security/deps-audit.mjs`: lockfiles, audit prod × dev, watchlist de out/2026, Node em fim de vida).
- P0/P1 de produção sem exceção válida → **bloqueie** e liste a correção de cada um (patch → overrides → CDN oficial).
- Correção que exige major → bloqueante em production até o usuário decidir (plano de migração da skill); não migre por conta.
- INCONCLUSIVO (sem rede, sem lockfile, gerenciador ausente) → bloqueante em production; atenção em staging.

### Etapa 1 — Secrets
Rode o histórico **e** o estático:
1. `node <plugin-root>/scripts/security/secret-scan.mjs --history --repo .` (na sessão principal; o agente não tem shell). Clone raso dá INCONCLUSIVO: `git fetch --unshallow` e repita.
2. Dispare o agente `secret-hunter` (Agent tool) para código, `.env*` e bundle.
Se houver crítico (P0) em qualquer um:
- **PARE** — siga `skills/secret-scanner/rotation-runbook.md` (provedor primeiro) antes de qualquer outra coisa. Não prossiga até `PASS`.

### Etapa 2 — Isolamento multi-tenant
Dispare o agente `tenant-isolation-auditor` (Agent tool). Se P0/P1 → bloqueie o deploy e liste fixes priorizados com cenário de exploração.

### Etapa 3 — Identidade & acesso
Dispare o agente `identity-access-auditor` (Agent tool): memberships, RBAC, convites, troca de tenant, super admin, anti-lockout. Escalonamento de privilégio = bloqueante.

### Etapa 4 — Integrações (se houver webhook/fila/API externa)
Dispare o agente `integration-reliability-auditor` (Agent tool): assinatura de webhook, idempotência, dedup, claim de fila, retry. Webhook sem assinatura ou que lê o tenant do conteúdo (em vez da conexão vinculada à conta externa) = bloqueante.

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
🚀 PRE-DEPLOY — <staging|production>  | Arquétipo: <A–E>

0. 📦 Dependências/Node:  <PASS|FAIL|INCONCLUSIVE>
1. 🔐 Secrets (+histórico): <PASS|FAIL|INCONCLUSIVE>
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
  Se aprovado: tag de release → aplicar migrations no remoto (pipeline ou autorização explícita; `supabase db push --dry-run` antes) → deploy → smoke test → monitorar logs 30min
  Se bloqueado: resolver bloqueantes em ordem → re-rodar $saas-shield-br:pre-deploy
```

## Entrada do usuário

`<argumentos>` — `staging` ou `production`. Em staging, atenções podem ser toleradas; em production, atenções acima de 3 viram bloqueantes.

## Nota para o Codex

Gerado de `saas-shield-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-shield-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
