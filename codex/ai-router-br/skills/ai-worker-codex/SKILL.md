---
name: ai-worker-codex
description: Forçar um Codex worker isolado para uma subtarefa delimitada pedida explicitamente pelo usuário.
---
# Codex Worker
Grave um TASK PACKAGE enxuto em `.ai-router/TASKS/<ID>.json` e rode `node "<plugin-root>/scripts/ai-router.mjs" dispatch --root . --task .ai-router/TASKS/<ID>.json --executor codex` (`<plugin-root>` = pasta dois níveis acima deste `SKILL.md`). Nunca contorne TIER 0, dirty git, secrets, allowlist ou revisão; revise o patch antes de aplicar e depois rode `tests_pending` na árvore principal. Copie literalmente o `summary_line` da saída, em linha própria, na resposta ao usuário.
