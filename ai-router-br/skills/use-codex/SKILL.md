---
name: use-codex
description: Force Codex worker para uma tarefa explicitamente solicitada pelo usuário, respeitando gates de segurança.
argument-hint: "<tarefa>"
disable-model-invocation: true
---
Crie TASK PACKAGE enxuto em `.ai-router/TASKS/<ID>.json` e rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-router.mjs" dispatch --root . --task .ai-router/TASKS/<ID>.json --executor codex`. Não contorne TIER 0, dirty git, secret preflight, allowlist ou revisão obrigatória. Revise o patch antes de aplicar qualquer coisa; depois de aplicar, rode `tests_pending` na árvore principal.

Tarefa: $ARGUMENTS
