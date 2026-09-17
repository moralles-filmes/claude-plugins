---
name: dry-run
description: Mostre como o ai-router-br classificaria uma tarefa sem executar workers ou editar produto.
argument-hint: "<tarefa>"
disable-model-invocation: true
---
# Dry run
Classifique sem executar workers. Rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-router.mjs" dry-run --root . --objective "<resumo curto e seguro da tarefa>"` — nunca cole o texto bruto do usuário no shell; se houver aspas ou símbolos, grave um TASK PACKAGE em `.ai-router/TASKS/` e use `--task`. O primeiro uso auto-inicializa `.ai-router/` de forma idempotente.

Mostre o `summary_line` literalmente e depois: Tarefa, Tier, Executor, Fallback, Motivo, Budget, Revisão e Auditoria.

Tarefa: $ARGUMENTS
