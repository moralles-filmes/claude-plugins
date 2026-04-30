---
description: Gera nova migration Supabase no padrão MarginPro — invoca skill supabase-migrator
argument-hint: "<descrição da mudança em PT-BR>"
---

Crie uma nova migration Supabase.

## Como proceder

1. **Invoque a skill `supabase-migrator`** com a descrição em `$ARGUMENTS`.

2. **Se não houver descrição** ou for genérica demais, pergunte:
   - Nome da tabela (ou alteração)?
   - Tipo: `crud-table`, `junction`, `audit-log`, `soft-delete`, `materialized-view`, `function`, `alter-only`?
   - Colunas adicionais?
   - Relacionamentos (FKs)?
   - Soft delete necessário?

3. **Gere o SQL completo** seguindo o padrão (4 camadas + índice + comentários PT-BR).

4. **Auto-valide** mentalmente contra o checklist de 24 itens do `rls-reviewer`.

5. **Apresente**:
   - Nome de arquivo sugerido (com timestamp UTC)
   - SQL completo pronto para colar
   - Resumo em 3 bullets do que faz
   - Próximos passos:
     ```
     1. Salvar em supabase/migrations/<timestamp>_<descr>.sql
     2. supabase db reset (testar local)
     3. supabase db push (aplicar local)
     4. Verificar policies no Studio
     5. Após validação, commit + PR
     6. Após merge, supabase db push --linked
     ```

6. **Antes de finalizar**, ofereça invocar `migration-validator` para validação independente do SQL gerado.

## Entrada do usuário

`$ARGUMENTS` — descrição em PT-BR. Exemplos:
- "Tabela invoices com customer_id, total_cents, status"
- "Junction entre users e teams"
- "Soft delete em customers"
- "RPC para arquivar invoice"
