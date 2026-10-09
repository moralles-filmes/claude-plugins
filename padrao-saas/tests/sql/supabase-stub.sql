-- Simulação mínima do que o Supabase traz pronto, só para testar o SQL de referência
-- num Postgres comum (CI e máquina local). NÃO é template: num projeto, o Supabase já tem isto.
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

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);

-- Mesma lógica do auth.uid() do Supabase: sub do JWT da requisição.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Default privileges do Supabase: tabela, função e sequence novas em public nascem com
-- tudo liberado para anon e authenticated. Os templates precisam revogar o que não querem.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
