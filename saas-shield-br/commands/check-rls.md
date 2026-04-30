---
description: Revisa RLS num arquivo .sql específico ou em todas as migrations recentes
argument-hint: "[arquivo.sql ou 'recent']"
---

Rode revisão de RLS.

## Como proceder

1. **Determine alvo**:
   - Se `$ARGUMENTS` é um path de arquivo: audite só esse
   - Se `$ARGUMENTS` é `recent`: liste migrations dos últimos 7 dias (`supabase/migrations/`) e audite todas
   - Se vazio: pergunte ao usuário qual arquivo ou se quer "recent"

2. **Invoque a skill `rls-reviewer`** com o(s) arquivo(s) selecionado(s).

3. **Para cada arquivo**:
   - Carregue conteúdo com Read
   - Aplique checklist de 24 itens
   - Aplique 12 anti-patterns
   - Devolva relatório por arquivo

4. **Para mais de um arquivo, devolva sumário consolidado no fim**:
   ```
   📋 SUMÁRIO MULTI-ARQUIVO
   
   - <arquivo1>: ✅ aprovado / 🚨 N bloqueantes
   - <arquivo2>: ✅ aprovado / 🚨 N bloqueantes
   
   Total: X bloqueantes / Y atenções
   ```

5. **Se houver bloqueantes**, recomende delegar a auditoria final ao subagent `rls-auditor` (Task tool):
   - Sub-agent dá segunda opinião isolada
   - Útil antes de merge de PR

## Entrada do usuário

`$ARGUMENTS`
