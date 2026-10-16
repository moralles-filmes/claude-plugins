---
name: use-codex
description: Force Codex worker para uma tarefa explicitamente solicitada pelo usuário, respeitando gates de segurança.
argument-hint: "<tarefa>"
disable-model-invocation: true
---
Crie TASK PACKAGE enxuto em `.ai-router/TASKS/<ID>.json` e rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-router.mjs" dispatch --root . --task .ai-router/TASKS/<ID>.json --executor codex` — o modelo e o esforço vêm do degrau Codex da complexidade da tarefa; acrescente `--model <slug>` e/ou `--effort low|medium|high` só se o usuário pediu um modelo específico. Se vier `status: delegate_claude`, chame o Agent tool com o `claude_agent` da saída. Não contorne TIER 0, dirty git, secret preflight, allowlist ou revisão obrigatória. Revise o patch antes de aplicar qualquer coisa; depois de aplicar, rode `tests_pending` na árvore principal. Copie literalmente o `summary_line` da saída, em linha própria, na resposta ao usuário.

Tarefa: $ARGUMENTS
