---
description: Revisa RLS num arquivo .sql específico ou em todas as migrations recentes (parametrizado pelo tenancy-profile)
argument-hint: "[arquivo.sql ou 'recent']"
---

Rode revisão de RLS.

## Como proceder

1. **Determine alvo**:
   - Se `$ARGUMENTS` é um path de arquivo: audite só esse.
   - Se `$ARGUMENTS` é `recent`: liste migrations dos últimos 7 dias (`supabase/migrations/`) e audite todas.
   - Se vazio: pergunte qual arquivo ou se quer `recent`.

2. **Resolva a convenção** — carregue a skill `tenant-model` e leia `.claude/tenancy-profile.yml` (ou detecte): `TC` (coluna de tenant), `R` (resolver), `WP` (write_path). **Não assuma `company_id`.**

3. **Invoque a skill `rls-reviewer`** com o(s) arquivo(s), aplicando o checklist parametrizado + os 12 anti-patterns. **Não** marque ausência de force-trigger como violação se `WP` ≠ `force-trigger`.

4. **Para mais de um arquivo, sumário consolidado**:
   ```
   📋 SUMÁRIO MULTI-ARQUIVO  | Arquétipo: <A|B|C|D>
   - <arquivo1>: PASS / FAIL (N bloqueantes)
   - <arquivo2>: ...
   Total: X bloqueantes / Y atenções
   ```

5. **Se houver bloqueantes ou dúvida**, dispare o agente `rls-auditor` (Agent tool com `subagent_type: rls-auditor`) para uma segunda opinião isolada — útil antes de merge de PR.

## Entrada do usuário

`$ARGUMENTS`
