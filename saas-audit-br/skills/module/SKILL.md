---
name: module
description: 'Auditoria e correção focada em um único módulo de SaaS, reutilizando saas-shield-br e code-health e seguindo o fluxo audit→P0-P3→fix→test sem refatorar o sistema inteiro. Use quando o usuário pedir para auditar um módulo específico, ou quando o ai-router-br retornar `audit_required: true`. Sem modo informado o padrão é `--fix`; se o usuário só pediu para auditar/ver, passe `--audit-only`. Auditoria do sistema inteiro é a skill manual `/saas-audit-br:audit`.'
argument-hint: "<módulo> [--audit-only | --fix | --full | --resume | --status]"
---

# SaaS Audit — por módulo

Entrada: `$ARGUMENTS`

O primeiro argumento lógico é o módulo/escopo. Modos:
- `--audit-only`
- `--fix` — padrão
- `--full`
- `--resume`
- `--status`

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
- `integration-reliability-auditor` — webhook/fila/API externa;
- `secret-hunter` — quando módulo toca integrações/server/client boundary;
- `supabase-auditor` — se Supabase;
- `ai-automation-auditor` — se IA/MCP/tool;
- `data-resilience-auditor` — se dados críticos/upload/exclusão/migration/financeiro.

Rode os independentes em paralelo.

Forneça a cada agent: mapa do módulo, tenancy-profile resolvido (ou `sem multi-tenant`/`INCONCLUSIVE`) e escopo (arquivos/camadas do módulo).

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

Se `--audit-only`, gere relatório e pare.

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

Atualize `CLAUDE.md`/`AGENTS.md` apenas com informação duradoura.

## Contexto

A auditoria por módulo deve ser significativamente menor que a completa.
Não carregue relatórios globais inteiros sem necessidade.
Use o state local do módulo para retomada após compactação/sessão.
