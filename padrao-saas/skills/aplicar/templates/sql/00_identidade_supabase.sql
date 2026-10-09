-- =====================================================================================
-- Padrão SaaS v3.2 — Adapter de identidade: SUPABASE AUTH
--
-- Único arquivo do modelo de acesso que conhece o schema `auth` do Supabase.
-- O núcleo (01_modelo_de_acesso.sql) só chama private.current_user_id() e referencia
-- public.app_users. Para sair do Supabase Auth, troque ESTE arquivo pelo
-- 00_identidade_postgres.sql; tabelas, policies e helpers continuam iguais (GCP_MIGRATION §2).
--
-- Ordem: 00_identidade_supabase.sql → 01_modelo_de_acesso.sql → migrations dos módulos.
-- Testes: 03_modelo_de_acesso.test.sql (núcleo) e 04_identidade_supabase.test.sql (este adapter).
-- =====================================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;  -- as policies chamam os helpers como authenticated

-- Usuário da requisição. Policies e helpers usam SEMPRE esta função, nunca auth.uid() direto.
-- Nas policies, chame como (select private.current_user_id()) para avaliar uma vez por consulta.
create or replace function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid()
$$;

revoke all on function private.current_user_id() from public;
grant execute on function private.current_user_id() to authenticated;

-- Espelho de auth.users em public.app_users (tabela criada no 01).
-- O domínio referencia app_users.id; trocar de provedor de identidade não mexe nas FKs.
-- plpgsql não valida tabelas na criação, então este arquivo pode rodar antes do 01.
create or replace function private.sync_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.app_users where id = old.id;
    return old;
  end if;

  insert into public.app_users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function private.sync_app_user() from public;

create trigger app_users_sync_insert
  after insert on auth.users
  for each row execute function private.sync_app_user();

create trigger app_users_sync_email
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_app_user();

create trigger app_users_sync_delete
  after delete on auth.users
  for each row execute function private.sync_app_user();

-- Projeto existente: depois de criar public.app_users, faça o backfill uma vez:
--   insert into public.app_users (id, email)
--   select id, email from auth.users
--   on conflict (id) do nothing;
