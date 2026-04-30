---
description: Auditoria funcional do projeto — encontra phantom buttons, broken routes, dados mockados, stubs, empty handlers, TODOs antigos. Gera relatório com severidade (BLOCKER/HIGH/MEDIUM/LOW) e veredito de prontidão para produção.
argument-hint: [scope: full|buttons|routes|mocks|stubs|handlers|todos]
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Task
---

# Audit — auditoria funcional

Você foi invocado pelo comando `/code-health:audit`. Argumento opcional: $ARGUMENTS (default: `full`).

## Plano de execução

1. Carregue o skill `functional-audit`. Siga o workflow das 5 fases.
2. Ajuste o escopo:
   - `full` (default): rode todos os 7 detectores
   - `buttons`: só phantom-buttons
   - `routes`: só broken-routes
   - `mocks`: só mocked-data
   - `stubs`: só stub-functions
   - `handlers`: só empty-handlers
   - `todos`: só TODOs/FIXMEs com idade
3. Delegue a varredura para o subagent `functional-auditor` via Task tool.
4. **Pare na Fase 4** (relatório). Não corrija nada automaticamente.
5. Mostre o veredito de prontidão e pergunte se deve começar pelos BLOCKERs.

## Garantias

- Modo report-first: nunca aplique fixes sem aprovação
- Cada fix posterior será item-a-item, com 2-4 opções apresentadas
- Branch separada (`audit/functional-<data>`) antes de qualquer edit

## Output esperado

```
✅ Auditoria funcional completa.

📄 Relatório: ./code-health-reports/functional-audit-<timestamp>.md

Veredito: ❌ NOT-PRODUCTION-READY (N BLOCKERs)
| ⚠️  NEEDS-WORK (M HIGHs)
| ✅ PRODUCTION-READY

Resumo:
- 🔴 BLOCKER: A — bloqueia deploy
- 🟠 HIGH: B — antes do próximo lançamento
- 🟡 MEDIUM: C — débito técnico
- 🟢 LOW: D — opcional

Top 3 BLOCKERs:
1. [tipo] em arquivo:linha — descrição
2. ...
3. ...

Próximos passos:
[1] Começar pelo Sprint 0 (quebra-galhos rápidos nos BLOCKERs)
[2] Revisar relatório completo
[3] Auditar só categoria específica (qual?)
[4] Cancelar

Qual escolha?
```
