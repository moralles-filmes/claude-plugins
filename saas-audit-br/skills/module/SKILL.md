---
name: module
description: 'Auditoria e correção focada em um único módulo de SaaS, reutilizando saas-shield-br e code-health e seguindo o fluxo audit→P0-P3→fix→test sem refatorar o sistema inteiro. Use quando o usuário pedir para auditar um módulo específico, ou quando o ai-router-br retornar `audit_required: true`. Sem modo informado o padrão é `--audit-only` (não edita código); passe `--fix`/`--full` só quando o usuário pedir correção explícita ou o chamador mandar o modo (ex.: `ai-router-br`). Auditoria do sistema inteiro é a skill manual `/saas-audit-br:audit`.'
argument-hint: "<módulo> [--audit-only (padrão) | --fix | --full | --resume | --status]"
---

# SaaS Audit — por módulo

Entrada: `$ARGUMENTS`

O primeiro argumento lógico é o módulo/escopo. Modos:
- `--audit-only` — **padrão**: audita, classifica e planeja; não edita código
- `--fix` — só explícito: corrige P0/P1/P2 com teste
- `--full` — só explícito: `--fix` + hardening P3 relevante
- `--resume`
- `--status`

Não deduza `--fix` de um pedido vago ("audita o módulo X"). Grave no state do módulo `Mode: audit-only (default)` ou `Mode: fix (explicit)`.

Carregue:
- `audit-state-protocol`
- `security-fix-protocol`
- `module-scope`

## Fase 1 — estado/baseline

Antes de gravar em `.saas-audit/`, garanta a regra local de exclusão (`audit-state-protocol`, seção Git).

Use `.saas-audit/modules/<slug>/STATE.md`, mas mantenha findings consolidados também em `.saas-audit/FINDINGS.md`.

Registre em `.saas-audit/STATE.md` (crie se não existir) a linha `Last scope: module:<slug> → .saas-audit/modules/<slug>/STATE.md`, sem apagar o estado de uma auditoria completa já registrada. É por ela que `/saas-audit-br:resume` e `/saas-audit-br:status` encontram a auditoria de módulo em nova sessão.

- `--status`: leia o state do módulo e os findings `MOD-<slug>-*`, resuma fase, bloqueantes e próxima ação, e pare.
- `--resume`: leia o state do módulo e continue da seção `Next`, sem repetir fases concluídas.

Leia:
- `CLAUDE.md`;
- `AGENTS.md`;
- git status;
- estado anterior.

Grave `Baseline commit` (`git rev-parse HEAD`) no state do módulo.

Não edite produto ainda.

## Fase 2 — descobrir o módulo real

Dispare `audit-architecture-mapper` pedindo foco no módulo.

Aplique `module-scope`.

Mapeie:
`UI -> API/action -> AuthN -> AuthZ -> Tenant -> regra -> banco -> integração/efeito`

Inclua somente dependências necessárias.

Se houver tenancy e `saas-shield-br`, resolva `tenant-model`; não assuma nome de coluna.

## Fase 3 — auditors relevantes

Não rode tudo mecanicamente.

Selecione por risco do módulo.

Exemplos:

### Sempre considerar
- `tenant-isolation-auditor` se multi-tenant;
- `identity-access-auditor` se houver permissões;
- `functional-auditor`;
- `business-process-auditor`.

### Condicionais
- `rls-auditor` — tabelas/migrations do módulo;
- `migration-validator` — só migrations do módulo não commitadas, alteradas desde a última auditoria concluída (`Baseline commit` de um `.saas-audit/STATE.md` com `Phase: done`) ou as do PR/tarefa; nunca o histórico do módulo inteiro;
- `integration-reliability-auditor` — webhook/fila/API externa;
- `secret-hunter` — quando módulo toca integrações/server/client boundary;
- `supabase-auditor` — se Supabase;
- `ai-automation-auditor` — se IA/MCP/tool;
- `data-resilience-auditor` — se dados críticos/upload/exclusão/migration/financeiro.

Rode os independentes em paralelo.

Uma verificação, um dono (mesma divisão da Fase 3 da skill `audit`): `rls-auditor` fica com policies/grants do SQL do módulo; `tenant-isolation-auditor` fica com os caminhos de código do módulo (telas, Edge Functions, server code, chamadas `.rpc()`/`.from()`) e não re-revisa policies; `migration-validator` só entra com migration nova/alterada, focado em idempotência, reversibilidade e compatibilidade.

Forneça a cada agent: mapa do módulo, tenancy-profile resolvido (ou `sem multi-tenant`/`INCONCLUSIVE`), escopo (arquivos/camadas do módulo) e o que fica com outro agente.

### Padrão SaaS e portabilidade do módulo

Se o projeto tem `scripts/check-portabilidade.mjs`, rode o bloco da seção "Padrão SaaS e portabilidade" da Fase 4 da skill `audit` (lido em `${CLAUDE_PLUGIN_ROOT}/skills/audit/SKILL.md`) e considere só os arquivos do módulo: dívida nova → P2, legada → P3 com item "reduzir linha de base deste módulo". Script ausente com `docs/standards/` presente → P3, sugerindo `padrao-saas:aplicar`. Nunca refatore para portabilidade em `--audit-only`; em `--fix`, só a dívida nova do módulo.

## Fase 4 — classificar

IDs: `MOD-<slug>-###`.

P0/P1/P2/P3, com:
- evidência;
- causa;
- impacto;
- correção;
- teste;
- risco da correção.

Deduplicate por causa raiz.

Se `--audit-only` (o padrão), gere relatório e pare, dizendo que nada foi corrigido e que a correção é `/saas-audit-br:module <módulo> --fix`.

## Fase 5 — corrigir

Corrija somente:
- causa raiz do módulo;
- camada compartilhada estritamente necessária.

Não transforme a tarefa em refatoração geral.

Ordem:
P0 -> teste -> P1 -> regressão -> P2 -> P3 somente `--full`.

Preserve mudanças do usuário.
Sem ações irreversíveis de produção.

## Fase 6 — regressão

Valide:
- fluxo normal do módulo;
- auth/RBAC;
- cross-tenant;
- regras de negócio;
- concorrência/idempotência quando aplicável;
- integrações;
- unit/integration/E2E relevantes;
- typecheck/build se a mudança justificar.

Use `security-regression-verifier`.

## Fase 7 — relatório

Gere:
`.saas-audit/modules/<slug>/REPORT.md`

Inclua:
- mapa do módulo;
- dependências tocadas;
- findings;
- correções;
- testes;
- pendências;
- impacto fora do módulo;
- riscos residuais.

Atualize `CLAUDE.md`/`AGENTS.md` apenas com informação duradoura, seguindo as regras de "Onde gravar" da Fase 10 da skill `audit` (no Padrão SaaS: só `AGENTS.md`, detalhes em "Particularidades" ou `docs/modules/<modulo>.md`).

## Contexto

A auditoria por módulo deve ser significativamente menor que a completa.
Não carregue relatórios globais inteiros sem necessidade.
Use o state local do módulo para retomada após compactação/sessão.
