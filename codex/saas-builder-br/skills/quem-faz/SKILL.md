---
name: quem-faz
description: "Pergunta ao arquiteto-chefe qual subagent deve cuidar de uma tarefa específica, sem disparar a tarefa. Use quando o usuário pedir (equivale ao comando /quem-faz do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill.

Você vai chamar o subagent `arquiteto-chefe` apenas para ROTEAMENTO — sem executar a tarefa.

**Tarefa a rotear**: <argumentos>

Invoque o subagent `arquiteto-chefe` via Agent tool com este prompt:

```
Tarefa: Identificar subagent responsável (sem executar).

Pedido do usuário: <colar <argumentos> aqui>

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

## Nota para o Codex

Gerado de `saas-builder-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-builder-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
