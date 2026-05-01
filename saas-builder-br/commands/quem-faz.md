---
description: Pergunta ao arquiteto-chefe qual subagent deve cuidar de uma tarefa específica, sem disparar a tarefa.
---

Você vai chamar o subagent `arquiteto-chefe` apenas para ROTEAMENTO — sem executar a tarefa.

**Tarefa a rotear**: $ARGUMENTS

Invoque o subagent `arquiteto-chefe` via Task tool com este prompt:

```
Tarefa: Identificar subagent responsável (sem executar).

Pedido do usuário: <colar $ARGUMENTS aqui>

Ações:
1. Consulte sua tabela de roteamento por palavra-chave
2. Identifique:
   - Qual subagent deveria pegar
   - Qual fase do projeto a tarefa pertence
   - Quais gates de segurança seriam disparados depois
3. NÃO execute. Apenas devolva o roteamento.

Formato de retorno:
- Subagent: <nome>
- Fase: <nome da fase>
- Gates pós-execução: <lista>
- Comando sugerido: "Para executar, peça: '<frase exata>'"
```

Repasse a resposta ao usuário.
