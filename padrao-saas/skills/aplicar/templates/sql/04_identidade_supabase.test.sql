-- =====================================================================================
-- Padrão SaaS v3.2 — Testes do adapter de identidade Supabase (pgTAP)
-- Rodar no Supabase local junto com 03_modelo_de_acesso.test.sql (`supabase test db`).
-- Pressupõe 00_identidade_supabase.sql e 01_modelo_de_acesso.sql aplicados.
-- Não se aplica ao adapter Postgres puro (lá não existe auth.users).
-- =====================================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fabio@teste.local');

select is(
  (select email from public.app_users where id = '00000000-0000-0000-0000-0000000000f1'),
  'fabio@teste.local',
  'cadastro no Supabase Auth cria a linha em public.app_users'
);

update auth.users set email = 'fabio.novo@teste.local'
 where id = '00000000-0000-0000-0000-0000000000f1';

select is(
  (select email from public.app_users where id = '00000000-0000-0000-0000-0000000000f1'),
  'fabio.novo@teste.local',
  'troca de e-mail no Supabase Auth é espelhada'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

select is(
  private.current_user_id(),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'private.current_user_id() devolve o sub do JWT no adapter Supabase'
);
select is((select count(*)::int from public.app_users), 1, 'usuário sem empresa vê só o próprio cadastro');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f1';

select is(
  (select count(*)::int from public.app_users where id = '00000000-0000-0000-0000-0000000000f1'),
  0,
  'exclusão no Supabase Auth remove o usuário de public.app_users'
);

select * from finish();
rollback;
