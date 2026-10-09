-- =====================================================================================
-- Padrão SaaS v3.2 — Adapter de identidade: POSTGRES PURO (API própria, Cloud SQL)
--
-- Substitui 00_identidade_supabase.sql quando o banco não é o Supabase ou quando a
-- autenticação sai do Supabase Auth. O núcleo (01) e os módulos não mudam.
--
-- Como a API usa (uma transação por requisição; nunca fora de transação):
--
--   begin;
--   set local role authenticated;                          -- papel sem BYPASSRLS
--   select set_config('app.user_id', $1, true);            -- app_users.id já resolvido pela API
--   ... queries do caso de uso ...
--   commit;
--
-- Regras (GCP_MIGRATION §2):
--   - sempre set_config(..., true) / SET LOCAL: o valor morre no fim da transação e a
--     conexão volta limpa ao pool;
--   - o papel de login da API só tem permissão de `set role authenticated` (grant authenticated
--     to <papel_da_api>); migrations rodam com outro papel;
--   - a API valida o token do provedor (Supabase Auth, Identity Platform…) e resolve o
--     app_users.id ANTES de abrir a transação. Mapeamento provedor → app_users.id fica numa
--     tabela user_identities (provider, subject, user_id), criada quando houver 2º provedor.
--
-- Ordem: 00_identidade_postgres.sql → 01_modelo_de_acesso.sql → migrations dos módulos.
-- =====================================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Usuário da requisição, definido pela API na transação. Sem valor → null → nenhuma policy passa.
create or replace function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

revoke all on function private.current_user_id() from public;
grant execute on function private.current_user_id() to authenticated;
