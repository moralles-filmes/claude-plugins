---
name: ai-worker-cheap
description: Forçar o worker econômico DeepSeek para uma subtarefa delimitada pedida explicitamente pelo usuário.
---
# DeepSeek Worker
Grave um TASK PACKAGE enxuto em `.ai-router/TASKS/<ID>.json` e rode `node "<plugin-root>/scripts/ai-router.mjs" dispatch --root . --task .ai-router/TASKS/<ID>.json --executor deepseek` (`<plugin-root>` = pasta dois níveis acima deste `SKILL.md`). Respeite budget, escopo, secrets e revisão; nunca envie dados sensíveis; revise o patch antes de aplicar e depois rode `tests_pending` na árvore principal. Copie literalmente o `summary_line` da saída, em linha própria, na resposta ao usuário.
