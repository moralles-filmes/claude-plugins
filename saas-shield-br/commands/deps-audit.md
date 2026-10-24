---
description: Audita as dependências do projeto (lockfiles, audit prod × dev, watchlist de out/2026, versão do Node) executando o scripts/security/deps-audit.mjs e conduz a correção
argument-hint: "[opcional: pasta do projeto | 'offline' para rodar sem o audit do gerenciador (resultado INCONCLUSIVO)]"
---

Carregue a skill `dependency-audit` e siga o fluxo dela.

## Como proceder

1. Rode na sessão principal (precisa de shell e, para o audit, de rede):
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/security/deps-audit.mjs --root <pasta> --report .deps-audit/report.json
   ```
   `<pasta>` vem de `$ARGUMENTS` (padrão `.`). Com `offline` em `$ARGUMENTS`, acrescente `--no-audit` e diga que o resultado é INCONCLUSIVO.
2. Mostre o veredito e os bloqueantes (P0/P1) primeiro, com a correção de cada um.
3. Corrija o que está **dentro da faixa** e o que se resolve com **overrides** só depois de confirmar com o usuário; rode o script de novo para provar.
4. Para cada correção que exige **major**, entregue o plano de migração da skill e **espere a decisão do usuário**. Nunca rode `npm audit fix --force`.
5. Feche com: veredito final, o que foi corrigido, o que ficou como exceção (com prazo) e as majors aguardando decisão.

## Entrada do usuário

`$ARGUMENTS`
