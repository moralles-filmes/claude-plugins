---
name: status
description: Leia o estado persistente do ai-router-br e resuma tarefas/resultados sem executar workers.
disable-model-invocation: true
---
Leia `.ai-router/STATE.md`, `.ai-router/RESULTS/` e `.ai-router/COSTS.jsonl` quando existirem. Resuma sem mostrar secrets, patches inteiros ou prompts completos. Para o ambiente, rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --root .`.
