---
name: deps-audit
description: "Audita as dependências do projeto (lockfiles, audit prod × dev, watchlist de out/2026, versão do Node) executando o scripts/security/deps-audit.mjs e conduz a correção. Use quando o usuário pedir (equivale ao comando /deps-audit do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill — formato `[opcional: pasta do projeto | 'offline' para rodar sem o audit do gerenciador (resultado INCONCLUSIVO)]`.

Carregue a skill `dependency-audit` e siga o fluxo dela.

## Como proceder

1. Rode na sessão principal (precisa de shell e, para o audit, de rede):
   ```bash
   node <plugin-root>/scripts/security/deps-audit.mjs --root <pasta> --report .deps-audit/report.json
   ```
   `<pasta>` vem de `<argumentos>` (padrão `.`). Com `offline` em `<argumentos>`, acrescente `--no-audit` e diga que o resultado é INCONCLUSIVO.
2. Mostre o veredito e os bloqueantes (P0/P1) primeiro, com a correção de cada um.
3. Corrija o que está **dentro da faixa** e o que se resolve com **overrides** só depois de confirmar com o usuário; rode o script de novo para provar.
4. Para cada correção que exige **major**, entregue o plano de migração da skill e **espere a decisão do usuário**. Nunca rode `npm audit fix --force`.
5. Feche com: veredito final, o que foi corrigido, o que ficou como exceção (com prazo) e as majors aguardando decisão.

## Entrada do usuário

`<argumentos>`

## Nota para o Codex

Gerado de `saas-shield-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-shield-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
