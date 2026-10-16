---
name: status
description: "Mostra somente o status atual de uma auditoria saas-audit-br, sem editar ou executar novas waves. Use só quando o usuário pedir explicitamente."
---

Leia, se existirem:
- `.saas-audit/STATE.md`;
- `.saas-audit/FINDINGS.md`;
- `.saas-audit/PLAN.md`.

Se o último escopo (`Last scope`/`Scope`) for um módulo, leia também `.saas-audit/modules/<slug>/STATE.md`.

Mostre de forma curta:
- escopo;
- modo;
- fase;
- quantidade P0/P1/P2/P3;
- bloqueantes;
- último checkpoint;
- próxima ação.

Não execute auditoria, testes, fixes ou deploy.

## Nota para o Codex

Gerado de `saas-audit-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-audit-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
