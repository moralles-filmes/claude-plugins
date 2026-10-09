# Naming conventions

> Projeto com `docs/standards/`: as convenções de lá prevalecem. Abaixo, o padrão do arquétipo E (Padrão SaaS v3.2).

## Arquivos
- `supabase/migrations/YYYYMMDDHHMMSS_<descricao_snake_case>.sql`
- Timestamp UTC do momento da criação
- Descrição em snake_case, máx ~50 chars
- Exemplos:
  - `20260429143022_create_invoices_table.sql`
  - `20260429143501_add_invoice_status_index.sql`
  - `20260429144210_optimize_rls_allowed_company_ids.sql`
- Crie com `supabase migration new <descricao>`: o CLI põe o timestamp

## Tabelas
- `snake_case`, plural
- Sem prefixo de schema no nome (use `public.tabela`)
- ✅ `invoices`, `customer_addresses`, `payment_methods`
- ❌ `Invoice`, `tbl_invoice`, `invoiceItems`

## Colunas
- `snake_case`
- IDs sempre `id` (PK), `<entidade>_id` (FK)
- Tenant e filial: o nome declarado no `tenancy-profile` (`company_id`, `location_id` no arquétipo E). Não crie `tenant_id` num banco que usa `company_id`
- Usuário: `user_id`/`created_by` → `public.app_users (id)`, nunca `auth.users`
- Dinheiro: inteiro em centavos (`amount_cents`) ou `numeric`, nunca `float`
- Timestamps: `created_at`, `updated_at`, `deleted_at`, `<verbo>_at` (ex: `archived_at`)
- Booleanos: `is_<adjetivo>` ou `has_<obj>` (`is_active`, `has_signed`)
- ✅ `created_at`, `total_value_cents`, `is_active`
- ❌ `createdAt`, `total_value`, `active`

## Policies
- Padrão: `<tabela>_<operacao>` (uma policy por operação); sufixo de contexto só quando houver mais de uma
- ✅ `bills_select`, `bills_insert`, `bills_update`
- ❌ `policy1`, `select_invoices`, `RLS_invoices`, `"Enable read access for all users"`

## Triggers
- `<tabela>_<ação>` ou `<tabela>_<frequência>`
- ✅ `role_permissions_validate`, `invoices_set_updated_at` (`invoices_force_company_id` só no arquétipo A)
- ❌ `trg_invoice`, `before_insert_invoice`

## Funções
- Helpers de RLS e internos: schema `private` (fora do schema exposto)
  - `private.current_user_id()`, `private.allowed_company_ids(text, boolean)`, `private.allowed_location_ids(text)`
- Predicados: `is_<...>` ou `has_<...>`
  - `private.is_platform_admin()`
- RPC público (API intencional): `public.<acao>_<entidade>` em snake_case, ação do catálogo
  - `public.baixar_conta_pagar(uuid)`, `public.cancelar_pedido(uuid)`
- Trigger functions: `<tabela>_<ação>` (mesma do trigger)
- Legado A: `public.get_current_company_id()`

## Índices
- `<tabela>_<colunas>_idx`
- ✅ `bills_company_idx`, `bills_location_idx`, `bills_company_status_idx`
- Índices parciais: descreva a condição
  - `company_members_user_idx … where status = 'active'`
- Projeto legado com `idx_<tabela>_<colunas>`: mantenha a convenção dele

## Constraints
- PK: implícita
- FK: `<tabela>_<col>_fkey` (default do Postgres)
- Check: `<tabela>_<col>_check` ou `<tabela>_<descrição>_check`
- Unique: `<tabela>_<col>_key` ou `<tabela>_<colunas>_key`

## Schemas
- `public` para o domínio multi-tenant (exposto pela API: RLS + FORCE + grants explícitos)
- `private` para helpers e funções internas (`revoke all on schema private from public`; `usage` só para `authenticated`)
- `auth` reservado pelo Supabase: só o adapter de identidade (`00_identidade_supabase.sql`) referencia
- `archive` para tabelas arquivadas (opcional)

## Comentários
- PT-BR para comentários de documentação (`COMMENT ON …`)
- Inglês para comentários de implementação (`-- TODO …`) — escolha sua convenção e seja consistente

## Migration descriptions
- Verbo no infinitivo: `create_`, `add_`, `drop_`, `alter_`, `rename_`, `optimize_`, `fix_`
- Objeto direto: `create_invoices_table`, `add_invoice_status_index`, `drop_legacy_columns`
- Quando refatora: `refactor_<o que>_<como>`
  - `refactor_rls_use_allowed_company_ids`
  - `optimize_rls_performance` (estilo seu repo)
