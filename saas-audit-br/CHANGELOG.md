# Changelog

## 1.2.1 — 2026-09-25

- `.saas-audit/` passa a ser adicionada ao `.git/info/exclude` antes da primeira gravação de cada sessão, inclusive ao retomar uma auditoria. O protocolo já dizia que a pasta era estado local, mas nada a escondia do git: `STATE.md` e os outros arquivos apareciam como não versionados e o `ai-router-br` recusava delegar ao Codex/DeepSeek (`dirty_worktree`). A regra é local, idempotente e não mexe no `.gitignore`. Para versionar um relatório a pedido do usuário, use `git add -f`; arquivos já versionados continuam versionados.

## 1.2.0 — 2026-09-18

- `audit` Fase 6 ganha a **tabela de equivalência de severidades**: os auditores do shield já falam P0–P3, mas o `code-health` reporta BLOCKER/HIGH/MEDIUM/LOW (e `confidence` no dead code) e as skills manuais do shield usam 🚨/🟡/🔵. Sem a tabela cada consolidação convertia de um jeito. Regra: BLOCKER → P1 (P0 só com dado/pagamento exposto), HIGH → P2 (P1 em rota pública/checkout), MEDIUM/LOW → P3, dead code → P3; 🚨 → P0/P1, 🟡 → P2, 🔵 → P3. Divergência entre agentes: prevalece a maior e fica registrada.

## 1.1.0 — 2026-09-17

- `module` pode ser acionada pelo modelo (saiu `disable-model-invocation`). O `ai-router-br` manda auditar o módulo quando retorna `audit_required: true`, mas com a skill manual o Claude não conseguia chamá-la e caía sempre na revisão própria. A descrição diz quando usar e quando passar `--audit-only`.
- `audit` (sistema inteiro), `resume` e `status` continuam manuais.
- O `saas-builder-br` 1.2.0 passa a usar `/saas-audit-br:audit` nas Fases 6 e 7 em vez de manter lista própria de auditores.

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
