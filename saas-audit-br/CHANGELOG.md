# Changelog

## 1.0.0

- Auditoria completa `audit`.
- Auditoria por módulo `module`.
- Modos `--audit-only`, `--fix`, `--full`.
- Retomada por estado em disco.
- Integração com `saas-shield-br`.
- Integração com `code-health`.
- Agent de mapa arquitetural.
- Agent de risco de processo/negócio.
- Agent de IA/automações.
- Agent de resiliência/ciclo de dados.
- Verificador de regressão.
- Correção em ondas P0 → P1 → P2 → hardening.
- Proteções contra operações irreversíveis de produção.

### Ajustes na integração ao marketplace

- `resume`: recarrega o procedimento via `${CLAUDE_PLUGIN_ROOT}/skills/{audit,module}/SKILL.md` — `audit`/`module` são manuais (`disable-model-invocation`) e não podem ser carregadas pelo modelo numa sessão nova.
- `module`: registra `Last scope` em `.saas-audit/STATE.md` e descreve `--status`/`--resume`, para `resume`/`status` acharem auditorias só de módulo.
- Tenancy-profile repassado às waves complementares e à regressão; `tenant-model` pré-carregado nos agents que checam tenant.
- `business-process-auditor`, `ai-automation-auditor`, `data-resilience-auditor`: sem `Bash` (análise estática; read-only garantido pela allowlist).
- Fronteiras de delegação com `integration-reliability-auditor`, `migration-validator` e `secret-hunter`; regressão re-dispara o especialista de origem.
