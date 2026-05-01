---
description: Pergunta ao arquiteto-chefe qual é a próxima ação no projeto SaaS atual, baseado no estado em .claude/saas-state.json.
---

Você vai chamar o subagent `arquiteto-chefe` para identificar e executar (ou propor) o próximo passo.

Ações:

1. **Verifique** se existe `.claude/saas-state.json` no repo. Se não existir:
   - Responda: "Nenhum projeto SaaS iniciado. Use `/novo-saas <conceito>` para começar."
   - Termine.

2. Se existir, invoque o subagent `arquiteto-chefe` via Task tool:

```
Tarefa: Avaliar estado atual do projeto e identificar próximo passo.

Ações:
1. Leia .claude/saas-state.json
2. Identifique a fase atual e o que está completo/pendente
3. Decida o próximo passo:
   - Se há gate de segurança pendente → dispare o agent do shield (rls-auditor / tenant-leak-hunter / secret-hunter)
   - Se a fase atual tem entregável incompleto → invoque o agent dono da fase
   - Se a fase está done → pergunte ao usuário se pode avançar para a próxima

4. Devolva resumo curto:
   - Fase atual
   - Último entregável
   - Próxima ação proposta
   - Pergunta de confirmação (se necessária)
```

3. Repasse o resumo do arquiteto-chefe ao usuário.
