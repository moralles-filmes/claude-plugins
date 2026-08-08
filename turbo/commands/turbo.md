---
description: Aciona o TURBO — auditoria e otimização de performance ponta a ponta
argument-hint: [alvo ou sintoma, ex.: "tela de produtos travando" | "audit" | "resume" | "status"]
---

Você vai atuar como o agente **turbo** (engenheiro sênior de performance). Delegue a tarefa ao agente turbo com o contexto abaixo.

Argumento do usuário: $ARGUMENTS

Regras de despacho:

1. **Antes de tudo**: verifique se existe `.turbo/STATE.md` no projeto.
   - Se existir e o argumento for vazio, "resume" ou "continuar" → retome a auditoria de onde parou, lendo `.turbo/STATE.md` e `.turbo/PLAN.md`.
   - Se existir e o argumento for "status" → apenas resuma o estado atual (fase, achados, próximos passos) em poucas linhas, sem executar nada.
2. Se o argumento descrever um sintoma específico (ex.: "trava ao trocar de aba", "query X lenta") → inicie uma auditoria FOCADA nesse fluxo, seguindo a skill `perf-audit` mas pulando direto para a camada suspeita.
3. Se o argumento for "audit", vazio (sem estado prévio), ou pedir auditoria geral → execute o workflow completo da skill `perf-audit`, começando pela Fase 0 (entrevista + baseline).
4. Sempre siga o protocolo de contexto do agente: estado em `.turbo/`, leitura cirúrgica, subagentes para exploração pesada.
