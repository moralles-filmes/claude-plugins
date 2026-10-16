# Changelog

## 1.3.0 — 2026-10-08

- **`--audit-only` passa a ser o padrão** de `/saas-audit-br:audit` e `/saas-audit-br:module`. Antes, sem modo informado, o audit corrigia código (`--fix`); para rodar o plugin em todos os sistemas existentes, o padrão seguro é só auditar e planejar. `--fix`/`--full` precisam ser explícitos e o `STATE.md` grava a origem (`Mode: fix (explicit)`). `resume` pergunta antes de editar quando o estado é anterior à 1.3.0 e o modo não está marcado como explícito. Depois de um `--audit-only` concluído, `--fix` reaproveita `FINDINGS.md`/`PLAN.md` se o `HEAD` não mudou. O `ai-router-br` já passa `--fix` explícito ao auditar módulo, então esse fluxo não muda.
- **Cada verificação de RLS roda uma vez.** Na wave de segurança, `rls-auditor`, `migration-validator` e `tenant-isolation-auditor` liam o mesmo SQL em paralelo. Agora: `rls-auditor` é o dono de policies e grants no conjunto de migrations; `tenant-isolation-auditor` cobre os caminhos de código (frontend, Edge Functions, server code) e não re-revisa policies; `migration-validator` só recebe migrations novas/alteradas desde a última auditoria (`Previous audit commit`), não commitadas ou do PR, nunca o histórico inteiro. Sem migration nova, ele fica N/A. `data-resilience-auditor` segue a mesma divisão e não gera achado de DROP/lock em migration já aplicada. `module` usa a mesma divisão.
- **Padrão SaaS e portabilidade na auditoria.** Com `scripts/check-portabilidade.mjs` no projeto, o audit roda `--json`, guarda a saída em `.saas-audit/portabilidade.json` e registra totais por regra e top módulos/arquivos: dívida nova (acima da linha de base) → P2; dívida legada → P3 com o item de plano "reduzir linha de base por módulo"; linha de base ausente → tudo legado, com ação manual de gravá-la. Com `docs/standards/` e sem o script → P3 sugerindo `padrao-saas:aplicar`. `scripts/check-padrao.mjs` também roda quando existe (erros → P3). O audit nunca usa flags de escrita dos scripts nem refatora para portabilidade em `--audit-only`.
- `STATE.md` ganha `Baseline commit`, `Previous audit commit` e a seção "Padrão SaaS".
- README: versão estava em 1.0.0; corrigida.

## 1.2.2 — 2026-10-07

- Projetos no Padrão SaaS (`docs/standards/` + `.claude/tenancy-profile.yml`): a baseline trata esses documentos como a norma dos achados, e a Fase 10 grava só no `AGENTS.md` (o `CLAUDE.md` importa `@AGENTS.md`), mandando detalhe de assunto para "Particularidades deste projeto" ou `docs/modules/`. O corpo normativo de `docs/standards/` nunca é editado. Sem o padrão, o comportamento anterior continua.

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
