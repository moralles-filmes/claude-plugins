# Naming conventions

## Arquivos
- `supabase/migrations/YYYYMMDDHHMMSS_<descricao_snake_case>.sql`
- Timestamp UTC do momento da criação
- Descrição em snake_case, máx ~50 chars
- Exemplos:
  - `20260429143022_create_invoices_table.sql`
  - `20260429143501_add_invoice_status_index.sql`
  - `20260429144210_optimize_rls_get_current_company_id.sql`

## Tabelas
- `snake_case`, plural
- Sem prefixo de schema no nome (use `public.tabela`)
- ✅ `invoices`, `customer_addresses`, `payment_methods`
- ❌ `Invoice`, `tbl_invoice`, `invoiceItems`

## Colunas
- `snake_case`
- IDs sempre `id` (PK), `<entidade>_id` (FK)
- Timestamps: `created_at`, `updated_at`, `deleted_at`, `<verbo>_at` (ex: `archived_at`)
- Booleanos: `is_<adjetivo>` ou `has_<obj>` (`is_active`, `has_signed`)
- ✅ `created_at`, `total_value_cents`, `is_active`
- ❌ `createdAt`, `total_value`, `active`

## Policies
- Padrão: `<tabela>_<comando>_<contexto>`
- ✅ `invoices_select_own_tenant`, `invoices_insert_own_tenant`, `invoices_admin_select_all`
- ❌ `policy1`, `select_invoices`, `RLS_invoices`

## Triggers
- `<tabela>_<ação>` ou `<tabela>_<frequência>`
- ✅ `invoices_force_company_id`, `invoices_set_updated_at`, `invoices_audit_log`
- ❌ `trg_invoice`, `before_insert_invoice`

## Funções
- Resolvers/getters: `get_<o que retorna>`
  - `get_current_company_id()`, `get_user_role()`
- Predicados: `is_<...>` ou `has_<...>`
  - `is_admin()`, `has_feature(text)`
- RPC público: `<verbo>_<entidade>` em snake_case
  - `archive_invoice(uuid)`, `recalculate_totals(uuid)`
- Trigger functions: `<tabela>_<ação>` (mesma do trigger)

## Índices
- `idx_<tabela>_<colunas>` (separado por underline)
- ✅ `idx_invoices_company_id`, `idx_invoices_company_status`, `idx_invoices_created_at`
- Índices parciais: `idx_<tabela>_<col>_where_<condição>`
  - `idx_invoices_company_id_where_active` (com `WHERE deleted_at IS NULL`)

## Constraints
- PK: implícita
- FK: `<tabela>_<col>_fkey` (default do Postgres)
- Check: `<tabela>_<col>_check` ou `<tabela>_<descrição>_check`
- Unique: `<tabela>_<col>_key` ou `<tabela>_<colunas>_key`

## Schemas
- `public` para todo domínio multi-tenant
- `auth` reservado pelo Supabase (não toque)
- `internal` para funções helpers (opcional)
- `archive` para tabelas arquivadas (opcional)

## Comentários
- PT-BR para comentários de documentação (`COMMENT ON …`)
- Inglês para comentários de implementação (`-- TODO …`) — escolha sua convenção e seja consistente

## Migration descriptions
- Verbo no infinitivo: `create_`, `add_`, `drop_`, `alter_`, `rename_`, `optimize_`, `fix_`
- Objeto direto: `create_invoices_table`, `add_invoice_status_index`, `drop_legacy_columns`
- Quando refatora: `refactor_<o que>_<como>`
  - `refactor_rls_use_get_current_company_id`
  - `optimize_rls_performance` (estilo seu repo)
