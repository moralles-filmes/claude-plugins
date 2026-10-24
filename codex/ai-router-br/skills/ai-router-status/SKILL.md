---
name: ai-router-status
description: Ler o estado persistente do ai-router-br e resumir tarefas, resultados e custos sem executar workers. Use só quando o usuário pedir explicitamente o status do roteador.
---
# Status
Leia `.ai-router/STATE.md`, `.ai-router/RESULTS/` e `.ai-router/COSTS.jsonl` quando existirem. Resuma sem mostrar secrets, patches inteiros ou prompts completos. Para o ambiente, rode `node "<plugin-root>/scripts/doctor.mjs" --root .`, onde `<plugin-root>` é a pasta dois níveis acima deste `SKILL.md`; mostre `external_worker_blockers` e `warnings` (ex.: `node_eol_upgrade_to_22_or_24`).
