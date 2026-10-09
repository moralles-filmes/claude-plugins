-- =====================================================================================
-- Padrão SaaS v3.2 — Testes do modelo de acesso (pgTAP)
-- Rodar no Supabase local: copie para supabase/tests/database/ e execute `supabase test db`.
-- Pressupõe um adapter de identidade (00_identidade_supabase.sql ou 00_identidade_postgres.sql),
-- 01_modelo_de_acesso.sql e 02_exemplo_modulo_financeiro.sql aplicados
-- (adapte junto com eles quando os nomes do projeto mudarem).
-- O mesmo arquivo roda nos dois adapters: cada "login" define request.jwt.claims (Supabase)
-- e app.user_id (Postgres puro). No kit, `node padrao-saas/tests/run-sql-tests.mjs` roda os dois.
--
-- Cenário:
--   Empresa A (filiais A1, A2) contratou configuracoes + financeiro + estoque
--   Empresa B (filial B1) contratou configuracoes + estoque (SEM financeiro)
--   ana   proprietária de A
--   bruno membro de A com "financeiro.contas_pagar" só na filial A1; membro de B com papel estoque
--   carla membro de A com "financeiro.contas_pagar.ver" na empresa inteira
--   davi  membro de A com "financeiro.contas_pagar.editar" (sem .ver explícito)
--   eva   proprietária de B
-- =====================================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- ---------- Dados (como dono das tabelas; ignora RLS) ----------
insert into public.app_users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@teste.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@teste.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@teste.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'davi@teste.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'eva@teste.local');

insert into public.companies (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Empresa A', 'empresa-a'),
  ('10000000-0000-0000-0000-00000000000b', 'Empresa B', 'empresa-b');

insert into public.locations (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'A1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'A2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'B1');

insert into public.company_modules (company_id, module) values
  ('10000000-0000-0000-0000-00000000000a', 'configuracoes'),
  ('10000000-0000-0000-0000-00000000000a', 'financeiro'),
  ('10000000-0000-0000-0000-00000000000a', 'estoque'),
  ('10000000-0000-0000-0000-00000000000b', 'configuracoes'),
  ('10000000-0000-0000-0000-00000000000b', 'estoque');

insert into public.company_members (company_id, user_id, status, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'active', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'active', false),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'active', false),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'active', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'active', false),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000e1', 'active', true);

insert into public.member_permissions (company_id, user_id, permission, location_id) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'financeiro.contas_pagar',        '20000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'financeiro.contas_pagar.ver',    null),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'financeiro.contas_pagar.editar', null);

insert into public.member_roles (company_id, user_id, role_id)
select '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', r.id
  from public.roles r where r.company_id is null and r.key = 'estoque';

insert into public.suppliers (id, company_id, name) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Fornecedor A'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Fornecedor B');

insert into public.bills (id, company_id, location_id, supplier_id, amount_cents, due_date) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-00000000000a', 10000, '2026-11-10'),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-00000000000a', 20000, '2026-11-10'),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', 30000, '2026-11-10');

-- ---------- Integridade (ainda como dono, sem RLS) ----------
select throws_ok(
  $$ insert into public.bills (company_id, location_id, supplier_id, amount_cents, due_date)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000b1',
             '30000000-0000-0000-0000-00000000000a', 100, '2026-11-10') $$,
  '23503', null,
  'FK composta rejeita conta da empresa A apontando para filial da empresa B, mesmo sem RLS'
);

select throws_ok(
  $$ insert into public.member_permissions (company_id, user_id, permission)
     values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'financeiro.contas_pagr') $$,
  '23514', null,
  'Concessão com erro de digitação é rejeitada'
);

select throws_ok(
  $$ insert into public.member_permissions (company_id, user_id, permission)
     values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', '*') $$,
  '23514', null,
  '"*" não pode ser concedido direto ao membro'
);

-- ---------- ana: proprietária de A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000a1', true);

select is((select count(*)::int from public.bills), 2, 'ana vê as contas das duas filiais de A');
select is((select count(*)::int from public.bills where company_id = '10000000-0000-0000-0000-00000000000b'), 0,
          'ana não vê contas da empresa B');
select is((select count(*)::int from public.companies), 1, 'ana vê só a empresa A no seletor');
select is((select count(*)::int from public.app_users), 4, 'ana (proprietária) vê os usuários da empresa A, e só eles');

select throws_ok(
  $$ update public.bills set status = 'paid' where id = '40000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'status não é alterado por update direto, nem pela proprietária'
);
select lives_ok(
  $$ update public.bills set due_date = '2026-11-20' where id = '40000000-0000-0000-0000-0000000000a1' $$,
  'proprietária edita o vencimento'
);
select is((public.baixar_conta_pagar('40000000-0000-0000-0000-0000000000a1')).status, 'paid',
          'baixa pelo RPC funciona com a permissão');

-- ---------- bruno: contas a pagar só na filial A1 ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000b1', true);

select is((select count(*)::int from public.bills), 1, 'bruno vê só a conta da filial A1');
select lives_ok(
  $$ insert into public.bills (company_id, location_id, supplier_id, amount_cents, due_date)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
             '30000000-0000-0000-0000-00000000000a', 500, '2026-12-01') $$,
  'bruno lança conta na filial A1'
);
select throws_ok(
  $$ insert into public.bills (company_id, location_id, supplier_id, amount_cents, due_date)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2',
             '30000000-0000-0000-0000-00000000000a', 500, '2026-12-01') $$,
  '42501', null,
  'bruno não lança conta na filial A2'
);
select is((select count(*)::int from public.suppliers), 0, 'bruno não vê fornecedores (sem financeiro.fornecedores)');
select is((select count(*)::int from public.companies), 2, 'bruno vê as duas empresas de que é membro');
select ok(
  exists (select 1 from public.my_permissions('10000000-0000-0000-0000-00000000000a')
           where permission = 'financeiro.contas_pagar.criar'
             and location_id = '20000000-0000-0000-0000-0000000000a1'),
  'my_permissions mostra contas_pagar.criar na filial A1'
);
select ok(
  not exists (select 1 from public.my_permissions('10000000-0000-0000-0000-00000000000a')
               where permission like 'financeiro.contas_receber.%'),
  'my_permissions não mostra contas a receber'
);
select throws_ok(
  $$ insert into public.member_permissions (company_id, user_id, permission)
     values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'financeiro') $$,
  '42501', null,
  'bruno não concede acesso a si mesmo (escrita direta bloqueada)'
);
select throws_ok(
  $$ update public.company_members set is_owner = true
      where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null,
  'bruno não se promove a proprietário'
);

-- ---------- carla: só ver contas a pagar, empresa inteira ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000c1', true);

select is((select count(*)::int from public.bills), 3, 'carla vê as contas de A1 e A2');
select is((select count(*)::int from public.app_users), 1, 'carla (sem configuracoes.usuarios.ver) vê só o próprio usuário');
select throws_ok(
  $$ insert into public.bills (company_id, location_id, supplier_id, amount_cents, due_date)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
             '30000000-0000-0000-0000-00000000000a', 500, '2026-12-01') $$,
  '42501', null,
  'carla não lança conta (só .ver)'
);
select throws_ok(
  $$ select public.baixar_conta_pagar('40000000-0000-0000-0000-0000000000a2') $$,
  'P0002', null,
  'carla não dá baixa (sem .baixar) e o erro não revela se a conta existe'
);

-- ---------- davi: só .editar implica .ver ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000d1', true);
select is((select count(*)::int from public.bills), 3, 'davi vê contas porque qualquer ação do submódulo implica .ver');

-- ---------- eva: proprietária de B, que não contratou financeiro ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000e1', true);
select is((select count(*)::int from public.bills), 0, 'eva não vê contas: módulo financeiro não contratado por B');

-- ---------- empresa A em somente leitura ----------
reset role;
update public.companies set status = 'read_only' where id = '10000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000a1', true);

select is((select count(*)::int from public.bills), 3, 'empresa em read_only: proprietária ainda lê');
select throws_ok(
  $$ insert into public.bills (company_id, location_id, supplier_id, amount_cents, due_date)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
             '30000000-0000-0000-0000-00000000000a', 500, '2026-12-01') $$,
  '42501', null,
  'empresa em read_only: ninguém grava'
);

-- ---------- empresa A suspensa ----------
reset role;
update public.companies set status = 'suspended' where id = '10000000-0000-0000-0000-00000000000a';
set local role authenticated;
select is((select count(*)::int from public.bills), 0, 'empresa suspensa: nenhum dado');
select is((select count(*)::int from public.companies), 1, 'empresa suspensa continua visível para mostrar o aviso');

-- ---------- membership desativada tira o acesso na hora ----------
reset role;
update public.companies set status = 'active' where id = '10000000-0000-0000-0000-00000000000a';
update public.company_members set status = 'disabled'
 where company_id = '10000000-0000-0000-0000-00000000000a'
   and user_id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true),
       set_config('app.user_id', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from public.bills), 0, 'bruno desativado em A perde o acesso sem esperar token expirar');

-- ---------- filial desativada ----------
reset role;
update public.company_members set status = 'active'
 where company_id = '10000000-0000-0000-0000-00000000000a'
   and user_id = '00000000-0000-0000-0000-0000000000b1';
update public.locations set status = 'inactive' where id = '20000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select is((select count(*)::int from public.bills), 0, 'concessão numa filial inativa não dá acesso');

-- ---------- sem usuário na sessão ----------
select set_config('request.jwt.claims', '', true),
       set_config('app.user_id', '', true);
select is((select count(*)::int from public.companies), 0, 'sem usuário na sessão: nenhuma empresa');
select is((select count(*)::int from public.permissions), 0, 'sem usuário na sessão: nem o catálogo');

reset role;
select * from finish();
rollback;
