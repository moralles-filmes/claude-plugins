---
name: ai-router-dry-run
description: Classificar uma tarefa com o ai-router-br sem executar workers nem alterar o produto.
---
# Dry Run
Classifique somente. Rode `node "<plugin-root>/scripts/ai-router.mjs" dry-run --root . --objective "<resumo curto e seguro>"`, onde `<plugin-root>` é a pasta dois níveis acima deste `SKILL.md`. Não cole texto bruto do usuário no shell; com aspas ou símbolos, grave um TASK PACKAGE em `.ai-router/TASKS/` e use `--task`. O primeiro uso auto-inicializa `.ai-router/` de forma idempotente. Mostre tier, executor, fallback, motivo, budget, revisão e auditoria.
