---
name: audit-supabase
description: "Auditoria específica de projeto Supabase — cruza supabase/migrations + supabase/functions com referências em src/. Acha typos em .from(), buckets de Storage não declarados (INCONCLUSIVE), invokes quebrados, colunas erradas, dead tables/functions, Realtime sem cleanup. Use quando o usuário pedir (equivale ao comando /audit-supabase do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill.

Você vai disparar o subagent `supabase-auditor` para fazer varredura cruzada entre o schema declarado e o código.

**Argumentos opcionais**: <argumentos> (atualmente sem opções de scope — sempre roda os 7 detectores)

Ações:

1. Verifique se o projeto tem `supabase/migrations/` ou `supabase/functions/` antes de prosseguir. Se não tiver, responda: "Este não parece ser um projeto Supabase. Use `$code-health:audit` para auditoria genérica."

2. Invoque o subagent `supabase-auditor` via Agent tool:

```
Tarefa: Audit cruzado de schema Supabase vs código.

Escopo: rodar os 7 detectores na raiz do projeto atual.
- broken-table (.from('x') onde x não é tabela/view declarada; storage.from() não entra)
- storage-bucket-unverified (storage.from('b') sem bucket em migrations/seed/config.toml → INCONCLUSIVE, nunca BLOCKER)
- broken-function-invoke (.invoke('y') onde y não existe)
- unknown-column (.eq('col', _) com nome não declarado)
- dead-table (CREATE TABLE sem referência em src/)
- dead-edge-function (supabase/functions/y/ sem invoke em src/)
- realtime-no-cleanup (subscribe sem removeChannel)

Output esperado: .code-health/supabase-findings.json + sumário curto.
```

3. Quando o subagent retornar:
   - Leia o arquivo que o subagent devolver (`.code-health/supabase-findings.json`)
   - Mostre ao usuário um relatório formatado (markdown) com:
     - Veredito (PRODUCTION_READY / NEEDS_WORK / NOT_PRODUCTION_READY)
     - Estatísticas (tabelas, edge functions, refs)
     - Top 5 BLOCKERs e HIGHs com path:line + sugestão de fix
     - Resumo numérico de cada detector
     - Buckets não verificados como INCONCLUSIVE (confirmar com `select id from storage.buckets;`), separados dos BLOCKERs
   - Se houver BLOCKERs → pergunte se quer abrir branch de fix automático para os typos óbvios (broken-table com edit distance ≤ 2 para nome existente).

4. Não modifique arquivos do projeto. O subagent só escreve em `.code-health/` (fora do git, via `.git/info/exclude`) e este command só apresenta. Aplicação de fix é decisão separada do usuário.

## Nota para o Codex

Gerado de `code-health/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$code-health:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
