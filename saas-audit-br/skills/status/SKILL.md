---
name: status
description: Mostra somente o status atual de uma auditoria saas-audit-br, sem editar ou executar novas waves.
disable-model-invocation: true
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
