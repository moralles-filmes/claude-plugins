---
name: use-deepseek
description: Force DeepSeek worker para uma tarefa explicitamente solicitada pelo usuário, respeitando gates de segurança e budget.
argument-hint: "<tarefa>"
disable-model-invocation: true
---
Crie TASK PACKAGE enxuto em `.ai-router/TASKS/<ID>.json` e rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-router.mjs" dispatch --root . --task .ai-router/TASKS/<ID>.json --executor deepseek`. Nunca envie secrets ou dados sensíveis. Não contorne TIER 0, allowlist, budget ou revisão obrigatória. Revise o patch antes de aplicar qualquer coisa; depois de aplicar, rode `tests_pending` na árvore principal. Copie literalmente o `summary_line` da saída, em linha própria, na resposta ao usuário.

Tarefa: $ARGUMENTS
