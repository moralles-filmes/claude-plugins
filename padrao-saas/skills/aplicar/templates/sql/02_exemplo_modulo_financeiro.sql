-- =====================================================================================
-- Padrão SaaS v3.2 — EXEMPLO de módulo sobre o modelo de acesso
-- Mostra os três padrões que todo módulo usa:
--   1. tabela da EMPRESA (fornecedores): filtra por company_id
--   2. tabela da FILIAL (contas a pagar): filtra por location_id, FK composta garante a empresa
--   3. transição crítica (baixa) só por RPC: o cliente não altera "status" direto
-- Não aplique como está: é referência para o agente gerar as migrations do módulo real.
-- =====================================================================================

-- 1. Tabela da empresa -----------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index suppliers_company_idx on public.suppliers (company_id);

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;

create policy suppliers_select on public.suppliers for select to authenticated
  using (company_id in (select private.allowed_company_ids('financeiro.fornecedores.ver')));

-- true = exige concessão para a empresa inteira: usuário restrito a uma filial não altera
-- cadastro compartilhado por todas as filiais.
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)));

create policy suppliers_update on public.suppliers for update to authenticated
  using      (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)))
  with check (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)));

-- Grants explícitos: não dependa dos default privileges do Supabase (no Postgres puro eles
-- não existem e a tabela ficaria inacessível; no Supabase, dariam DELETE sem você pedir).
revoke all on public.suppliers from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;

-- 2. Tabela da filial ------------------------------------------------------------------
create table public.bills (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  location_id  uuid not null,
  supplier_id  uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  due_date     date not null,
  status       text not null default 'open' check (status in ('open', 'paid', 'canceled')),
  created_at   timestamptz not null default now(),
  -- FK composta: a filial e o fornecedor precisam ser da MESMA empresa da conta.
  -- Checagens de FK ignoram RLS; sem isto, uma conta de A poderia apontar para filial de B.
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);
create index bills_location_idx on public.bills (location_id);
create index bills_company_idx  on public.bills (company_id);

alter table public.bills enable row level security;
alter table public.bills force row level security;

-- A policy olha só location_id: a FK composta já amarra company_id à empresa da filial.
create policy bills_select on public.bills for select to authenticated
  using (location_id in (select private.allowed_location_ids('financeiro.contas_pagar.ver')));

create policy bills_insert on public.bills for insert to authenticated
  with check (location_id in (select private.allowed_location_ids('financeiro.contas_pagar.criar')));

create policy bills_update on public.bills for update to authenticated
  using      (location_id in (select private.allowed_location_ids('financeiro.contas_pagar.editar')))
  with check (location_id in (select private.allowed_location_ids('financeiro.contas_pagar.editar')));

-- 3. Caminho direto bloqueado para a transição crítica ---------------------------------
-- O cliente edita vencimento, valor e fornecedor; nunca status, empresa ou filial.
revoke all on public.bills from anon;
revoke insert, update, delete, truncate on public.bills from authenticated;
grant insert (company_id, location_id, supplier_id, amount_cents, due_date) on public.bills to authenticated;
grant update (supplier_id, amount_cents, due_date) on public.bills to authenticated;
grant select on public.bills to authenticated;

-- Baixa: modelo B de DATABASE §4 (usuário chama direto; a função verifica a permissão).
create or replace function public.baixar_conta_pagar(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  update public.bills b
     set status = 'paid'
   where b.id = p_bill_id
     and b.status = 'open'
     and b.location_id in (select private.allowed_location_ids('financeiro.contas_pagar.baixar'))
  returning b.* into v_bill;

  if not found then
    -- Mesma mensagem para "não existe", "já baixada" e "sem permissão": não revela existência.
    raise exception 'CONTA_INDISPONIVEL' using errcode = 'P0002';
  end if;

  -- Aqui entram, na mesma transação: auditoria e outbox (ARCHITECTURE §5).
  return v_bill;
end;
$$;

revoke all on function public.baixar_conta_pagar(uuid) from public, anon;
grant execute on function public.baixar_conta_pagar(uuid) to authenticated;
