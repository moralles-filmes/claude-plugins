---
name: audit
description: "Auditoria funcional do projeto — encontra phantom buttons, broken routes, dados mockados, stubs, empty handlers, TODOs antigos. Gera relatório com severidade (BLOCKER/HIGH/MEDIUM/LOW) e veredito de prontidão para produção. Use quando o usuário pedir (equivale ao comando /audit do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill — formato `[scope: full|buttons|routes|mocks|stubs|handlers|todos]`.

# Audit — auditoria funcional

Você foi invocado pelo comando `$code-health:audit`. Argumento opcional: <argumentos> (default: `full`).

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
3. Delegue a varredura para o subagent `functional-auditor` via Agent tool.
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

## Nota para o Codex

Gerado de `code-health/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$code-health:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
