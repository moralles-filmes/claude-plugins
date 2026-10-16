# saas-audit-br

Orquestrador de auditoria ponta a ponta para SaaS no Claude Code.

Ele **não substitui** `saas-shield-br` nem `code-health`. Ele coordena os especialistas existentes, adiciona auditores para áreas não cobertas e conduz o processo completo:

```text
BASELINE
  ↓
MAPA / TENANCY
  ↓
SEGURANÇA ESPECIALISTA (saas-shield-br)
  ↓
CODE HEALTH (code-health)
  ↓
PROCESSO / IA / DADOS (saas-audit-br)
  ↓
P0 / P1 / P2 / P3
  ↓
PLANO
  ↓
CORREÇÕES EM FASES
  ↓
TESTES / REGRESSÃO
  ↓
RELATÓRIO
```

## Dependências recomendadas

Obrigatórias para cobertura completa:
- `saas-shield-br`
- `code-health`

Sem uma delas o audit continua, mas a cobertura correspondente fica `INCONCLUSIVE`.

## Skills de uso

### Auditoria completa

```text
/saas-audit-br:audit
```

Default: `--audit-only` — audita, classifica e planeja, sem editar código. Correção só com modo explícito.

Modos:

```text
/saas-audit-br:audit                # = --audit-only
/saas-audit-br:audit --fix          # audita e corrige P0/P1/P2 com testes
/saas-audit-br:audit --full         # --fix + hardening P3 relevante e regressão ampliada
```

Depois de um `--audit-only` concluído, `--fix` reaproveita `FINDINGS.md`/`PLAN.md` se o código não mudou.

### Auditoria por módulo

```text
/saas-audit-br:module Financeiro        # = --audit-only
/saas-audit-br:module Agenda --fix
/saas-audit-br:module CRM --audit-only
/saas-audit-br:module IA --full
```

### Retomar / status

```text
/saas-audit-br:resume
/saas-audit-br:status
```

## O que reaproveita do saas-shield-br

Quando aplicável:
- `tenant-model`
- `agent-result-contract`
- `secret-hunter`
- `identity-access-auditor`
- `integration-reliability-auditor`
- `rls-auditor` — dono de policies e grants: lê o conjunto de migrations uma vez
- `tenant-isolation-auditor` — caminhos de código (frontend, Edge Functions, server code); não re-revisa policies SQL
- `migration-validator` — só migrations novas/alteradas desde a última auditoria ou no PR, nunca o histórico inteiro

Cada verificação roda uma vez: o mesmo achado de RLS não é pago três vezes.

O tenancy real é resolvido antes da auditoria. O plugin não assume `company_id`.

## O que reaproveita do code-health

- `functional-auditor`
- `dead-code-scanner`
- `supabase-auditor`

O audit usa esses agentes principalmente em modo de descoberta/relatório. Dead-code não relacionado não vira refatoração automática.

## Padrão SaaS e portabilidade

Em projeto com o Padrão SaaS instalado, o audit roda os scripts do próprio projeto, sem flags de escrita:
- `node scripts/check-padrao.mjs` — erros viram P3;
- `node scripts/check-portabilidade.mjs --json` — totais por regra e top módulos/arquivos. Dívida nova (acima de `.claude/portabilidade-baseline.json`) é P2; dívida legada é P3 com o item de plano "reduzir linha de base por módulo".

Com `docs/standards/` mas sem o script, o audit registra P3 e sugere `padrao-saas:aplicar`. O audit não grava linha de base e não refatora para portabilidade em `--audit-only`; em `--fix`, só a dívida nova.

## Auditores complementares deste plugin

| Agent | Papel |
|---|---|
| `audit-architecture-mapper` | stack, fluxos, trust boundaries, tenancy e comandos |
| `business-process-auditor` | pagamentos, estados, concorrência, idempotência, resiliência e custo |
| `ai-automation-auditor` | IA, MCP, tools, prompt injection, privilégios e exfiltração |
| `data-resilience-auditor` | storage, exclusão, backup/restore, migrations, logs e privacidade técnica |
| `security-regression-verifier` | prova pós-fix e regressão |

## Contexto e compactação

O progresso não depende da conversa.

Estado operacional:

```text
.saas-audit/
├── STATE.md
├── ARCHITECTURE.md
├── FINDINGS.md
├── PLAN.md
├── TESTS.md
├── REPORT.md
└── modules/
    └── <módulo>/
        ├── STATE.md
        └── REPORT.md
```

A pasta é local. Antes da primeira gravação, o plugin a adiciona ao `.git/info/exclude`, que não é versionado. Assim ela não aparece no `git status` e não impede o `ai-router-br` de delegar tarefas. Para versionar um relatório, use `git add -f <arquivo>`.

Após auto-compaction ou nova sessão:

```text
/saas-audit-br:resume
```

Subagents fazem as varreduras volumosas em contextos próprios e devolvem somente resumos.

## Segurança operacional

O plugin nunca deve executar automaticamente:
- `git reset --hard`;
- `git clean -fd`;
- force push;
- DROP/purge destrutivo em produção;
- restore em produção;
- rotação real de secret;
- alteração massiva irreversível de dados.

Esses casos viram procedimento manual com backup, rollback e validação.

## Severidade

- P0 — crítico
- P1 — alto
- P2 — médio
- P3 — hardening/baixo

O plugin deduplica findings por causa raiz e não transforma hipótese sem evidência em vulnerabilidade confirmada.

## Versão

1.3.0 — histórico em [CHANGELOG.md](CHANGELOG.md).
