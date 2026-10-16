---
name: proximo-passo
description: "Pergunta ao arquiteto-chefe qual é a próxima ação no projeto SaaS atual, baseado no estado em .claude/saas-state.json. Use quando o usuário pedir (equivale ao comando /proximo-passo do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill.

Você vai chamar o subagent `arquiteto-chefe` para identificar e executar (ou propor) o próximo passo.

Ações:

1. **Verifique** se existe `.claude/saas-state.json` no repo. Se não existir:
   - Responda: "Nenhum projeto SaaS iniciado. Use `$saas-builder-br:novo-saas <conceito>` para começar."
   - Termine.

2. Se existir, invoque o subagent `arquiteto-chefe` via Agent tool:

```
Tarefa: Avaliar estado atual do projeto e identificar próximo passo.

Ações:
1. Leia .claude/saas-state.json
2. Identifique a fase atual e o que está completo/pendente
3. Decida o próximo passo:
   - Se há gate de segurança pendente → dispare o agent do shield (rls-auditor / tenant-isolation-auditor / secret-hunter)
   - Se a fase é code_health ou security_audit → leia .saas-audit/REPORT.md e FINDINGS.md; sem REPORT novo, peça ao usuário para rodar $saas-audit-br:audit --audit-only
   - Se a fase atual tem entregável incompleto → invoque o agent dono da fase
   - Se a fase está done → pergunte ao usuário se pode avançar para a próxima

4. Devolva resumo curto:
   - Fase atual
   - Último entregável
   - Próxima ação proposta
   - Pergunta de confirmação (se necessária)
```

3. Repasse o resumo do arquiteto-chefe ao usuário.

## Nota para o Codex

Gerado de `saas-builder-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-builder-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
