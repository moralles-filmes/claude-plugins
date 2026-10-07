-- =====================================================================================
-- Padrão SaaS v3.1 — Modelo de acesso
-- Empresa (tenant) → Filial → Usuário, com usuário em várias empresas, papéis por empresa,
-- concessões diretas e permissões por módulo / submódulo / ação.
--
-- TEMPLATE. O agente adapta nomes ao projeto e gera a migration com timestamp
-- (supabase/migrations/<YYYYMMDDHHMMSS>_modelo_de_acesso.sql). Não aplique às cegas
-- num projeto existente: lá o caminho é expand → backfill → contract (DATABASE §1).
--
-- Requisitos: Postgres 15+ (unique nulls not distinct) e Supabase Auth (auth.uid()).
-- Testado com o arquivo 03_modelo_de_acesso.test.sql (pgTAP).
-- Normas: docs/standards/ACCESS_CONTROL.md e MULTI_TENANCY.md.
-- =====================================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;  -- as policies chamam os helpers como authenticated

-- -------------------------------------------------------------------------------------
-- 1. Empresas, filiais e membros
-- -------------------------------------------------------------------------------------

create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  -- active: normal | read_only: inadimplente, só leitura e exportação
  -- suspended: sem acesso a dados | canceled: em processo de exclusão (TENANT_LIFECYCLE)
  status     text not null default 'active'
             check (status in ('active', 'read_only', 'suspended', 'canceled')),
  created_at timestamptz not null default now()
);

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (company_id, id)  -- alvo das FKs compostas (company_id, location_id)
);
create index locations_company_idx on public.locations (company_id);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  is_owner   boolean not null default false,  -- proprietário: acesso total aos módulos contratados
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id) where status = 'active';

-- Administradores da PLATAFORMA (você). Identidade separada: não entra nas policies de tenant.
-- Acesso de suporte a dados de cliente segue SECURITY §4.1 (acesso de suporte auditado).
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
-- 2. Catálogo de módulos e permissões (escrito só por migration) e módulos contratados
-- -------------------------------------------------------------------------------------

create table public.app_modules (
  key  text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null
);

-- Chave: <modulo>.<submodulo>.<acao>  (ex.: financeiro.contas_pagar.baixar)
-- O primeiro segmento é sempre o módulo; o último é sempre a ação.
create table public.permissions (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  module      text not null references public.app_modules (key),
  description text not null,
  check (split_part(key, '.', 1) = module)
);

-- O que a empresa contratou. Sem o módulo habilitado, ninguém da empresa acessa,
-- nem o proprietário. O provisionamento habilita os módulos base (ex.: configuracoes).
create table public.company_modules (
  company_id uuid not null references public.companies (id) on delete cascade,
  module     text not null references public.app_modules (key),
  enabled    boolean not null default true,
  primary key (company_id, module)
);

-- -------------------------------------------------------------------------------------
-- 3. Papéis e concessões
-- -------------------------------------------------------------------------------------

-- company_id nulo = papel de sistema (vale para todas as empresas, mantido por migration).
create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  key        text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name       text not null,
  unique nulls not distinct (company_id, key)
);

-- permission é um PADRÃO de concessão: '*', um módulo, um submódulo ou uma chave completa.
-- 'financeiro'               → todo o módulo, inclusive submódulos criados no futuro
-- 'financeiro.contas_pagar'  → só contas a pagar, todas as ações
-- 'financeiro.contas_pagar.ver' → só ver contas a pagar
create table public.role_permissions (
  role_id    uuid not null references public.roles (id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

-- Papel atribuído ao membro. location_id nulo = todas as filiais da empresa.
create table public.member_roles (
  company_id  uuid not null,
  user_id     uuid not null,
  role_id     uuid not null references public.roles (id) on delete cascade,
  location_id uuid,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  foreign key (company_id, user_id) references public.company_members (company_id, user_id) on delete cascade,
  foreign key (company_id, location_id) references public.locations (company_id, id) on delete cascade,
  unique nulls not distinct (company_id, user_id, role_id, location_id)
);
create index member_roles_user_idx on public.member_roles (user_id);

-- Concessão direta ao membro (o "dar acesso só a Contas a Pagar"). Só adiciona; não existe negação.
create table public.member_permissions (
  company_id  uuid not null,
  user_id     uuid not null,
  permission  text not null,
  location_id uuid,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  foreign key (company_id, user_id) references public.company_members (company_id, user_id) on delete cascade,
  foreign key (company_id, location_id) references public.locations (company_id, id) on delete cascade,
  unique nulls not distinct (company_id, user_id, permission, location_id)
);
create index member_permissions_user_idx on public.member_permissions (user_id);

-- -------------------------------------------------------------------------------------
-- 4. Validação das concessões
-- -------------------------------------------------------------------------------------

-- Concessão com erro de digitação não dá acesso nenhum e passa despercebida. Rejeite.
create or replace function private.validate_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.permission = '*' then
    if tg_table_name <> 'role_permissions' then
      raise exception 'CONCESSAO_INVALIDA: "*" só é permitido em papel' using errcode = '23514';
    end if;
    return new;
  end if;
  if not exists (
    select 1 from public.permissions p
     where p.key = new.permission
        or starts_with(p.key, new.permission || '.')
  ) then
    raise exception 'CONCESSAO_INVALIDA: % não corresponde a nenhuma permissão do catálogo', new.permission
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger role_permissions_validate before insert or update on public.role_permissions
  for each row execute function private.validate_grant();
create trigger member_permissions_validate before insert or update on public.member_permissions
  for each row execute function private.validate_grant();

-- Papel de uma empresa não pode ser atribuído em outra.
create or replace function private.validate_member_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.roles r
     where r.id = new.role_id
       and (r.company_id is null or r.company_id = new.company_id)
  ) then
    raise exception 'PAPEL_DE_OUTRA_EMPRESA' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger member_roles_validate before insert or update on public.member_roles
  for each row execute function private.validate_member_role();

-- -------------------------------------------------------------------------------------
-- 5. Helpers de autorização (usados nas policies e nos casos de uso)
-- -------------------------------------------------------------------------------------

-- Empresas em que o usuário é membro ativo (seletor de empresa, banner de suspensão).
create or replace function private.user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id
    from public.company_members m
    join public.companies c on c.id = m.company_id
   where m.user_id = (select auth.uid())
     and m.status = 'active'
     and c.status in ('active', 'read_only', 'suspended')
$$;

-- Onde o usuário tem a permissão p_perm: (company_id, location_id), location_id nulo = todas.
-- Aplica, nesta ordem: membership ativa, status da empresa, módulo contratado, filial ativa
-- e casamento do padrão de concessão. Ação qualquer de um submódulo implica ".ver" dele.
create or replace function private.grants_for(p_perm text)
returns table (company_id uuid, location_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  g as (
    select m.company_id, null::uuid as location_id, '*'::text as permission
      from public.company_members m, me
     where m.user_id = me.uid and m.is_owner
    union all
    select mr.company_id, mr.location_id, rp.permission
      from public.member_roles mr
      join public.roles r on r.id = mr.role_id
                         and (r.company_id is null or r.company_id = mr.company_id)
      join public.role_permissions rp on rp.role_id = mr.role_id,
           me
     where mr.user_id = me.uid
    union all
    select mp.company_id, mp.location_id, mp.permission
      from public.member_permissions mp, me
     where mp.user_id = me.uid
  )
  select distinct g.company_id, g.location_id
    from g
    join me on true
    join public.company_members m on m.company_id = g.company_id
                                 and m.user_id = me.uid
                                 and m.status = 'active'
    join public.companies c on c.id = g.company_id
    join public.company_modules cm on cm.company_id = g.company_id
                                  and cm.module = split_part(p_perm, '.', 1)
                                  and cm.enabled
    left join public.locations l on l.id = g.location_id
   where (g.location_id is null or l.status = 'active')
     and (
           c.status = 'active'
        or (c.status = 'read_only' and (right(p_perm, 4) = '.ver' or right(p_perm, 9) = '.exportar'))
         )
     and (
           g.permission = '*'
        or g.permission = p_perm
        or starts_with(p_perm, g.permission || '.')
        or (right(p_perm, 4) = '.ver' and starts_with(g.permission, left(p_perm, -4) || '.'))
         )
$$;

-- Empresas onde o usuário tem p_perm. p_full_company = true exige concessão para a empresa
-- inteira (use em tabelas da empresa que um usuário restrito a uma filial não deve alterar).
create or replace function private.allowed_company_ids(p_perm text, p_full_company boolean default false)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.company_id
    from private.grants_for(p_perm) g
   where not p_full_company or g.location_id is null
$$;

-- Filiais (ativas) onde o usuário tem p_perm. Concessão para a empresa inteira se expande
-- para todas as filiais dela.
create or replace function private.allowed_location_ids(p_perm text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
    from private.grants_for(p_perm) g
    join public.locations l on l.company_id = g.company_id
   where l.status = 'active'
     and (g.location_id is null or g.location_id = l.id)
$$;

-- Para o backoffice da plataforma (servidor). Nunca use em policy de tabela de tenant.
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;

-- Permissões efetivas do usuário numa empresa, para montar menu e esconder botões.
-- Só UX: quem garante é a RLS e o caso de uso no servidor.
create or replace function public.my_permissions(p_company_id uuid)
returns table (permission text, location_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.key, g.location_id
    from public.permissions p
    cross join lateral private.grants_for(p.key) g
   where g.company_id = p_company_id
$$;

revoke all on function private.validate_grant() from public;
revoke all on function private.validate_member_role() from public;
revoke all on function private.user_company_ids() from public;
revoke all on function private.grants_for(text) from public;
revoke all on function private.allowed_company_ids(text, boolean) from public;
revoke all on function private.allowed_location_ids(text) from public;
revoke all on function private.is_platform_admin() from public;
revoke all on function public.my_permissions(uuid) from public, anon;

grant execute on function private.user_company_ids() to authenticated;
grant execute on function private.grants_for(text) to authenticated;
grant execute on function private.allowed_company_ids(text, boolean) to authenticated;
grant execute on function private.allowed_location_ids(text) to authenticated;
grant execute on function public.my_permissions(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 6. RLS das tabelas de acesso
-- -------------------------------------------------------------------------------------
-- FORCE: confirme antes que o dono das funções helper tem BYPASSRLS
--   select rolname, rolbypassrls from pg_roles where rolname = current_user;
-- Sem BYPASSRLS, FORCE faz os helpers security definer passarem pela RLS destas tabelas
-- e as policies entram em recursão. Ver DATABASE §5.

alter table public.companies          enable row level security;
alter table public.locations          enable row level security;
alter table public.company_members    enable row level security;
alter table public.platform_admins    enable row level security;
alter table public.app_modules        enable row level security;
alter table public.permissions        enable row level security;
alter table public.company_modules    enable row level security;
alter table public.roles              enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.member_roles       enable row level security;
alter table public.member_permissions enable row level security;

alter table public.companies          force row level security;
alter table public.locations          force row level security;
alter table public.company_members    force row level security;
alter table public.platform_admins    force row level security;
alter table public.app_modules        force row level security;
alter table public.permissions        force row level security;
alter table public.company_modules    force row level security;
alter table public.roles              force row level security;
alter table public.role_permissions   force row level security;
alter table public.member_roles       force row level security;
alter table public.member_permissions force row level security;

create policy companies_select on public.companies for select to authenticated
  using (id in (select private.user_company_ids()));

create policy locations_select on public.locations for select to authenticated
  using (company_id in (select private.user_company_ids()));

create policy company_members_select on public.company_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or company_id in (select private.allowed_company_ids('configuracoes.usuarios.ver'))
  );

-- Catálogo global, não sensível: qualquer usuário autenticado lê.
create policy app_modules_select on public.app_modules for select to authenticated
  using ((select auth.uid()) is not null);
create policy permissions_select on public.permissions for select to authenticated
  using ((select auth.uid()) is not null);

create policy company_modules_select on public.company_modules for select to authenticated
  using (company_id in (select private.user_company_ids()));

create policy roles_select on public.roles for select to authenticated
  using (company_id is null or company_id in (select private.user_company_ids()));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (
    exists (
      select 1 from public.roles r
       where r.id = role_id
         and (r.company_id is null or r.company_id in (select private.user_company_ids()))
    )
  );

create policy member_roles_select on public.member_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or company_id in (select private.allowed_company_ids('configuracoes.usuarios.ver'))
  );

create policy member_permissions_select on public.member_permissions for select to authenticated
  using (
    user_id = (select auth.uid())
    or company_id in (select private.allowed_company_ids('configuracoes.usuarios.ver'))
  );

-- platform_admins: nenhuma policy. Só o servidor (service role) lê.

-- -------------------------------------------------------------------------------------
-- 7. Grants: ninguém escreve direto nas tabelas de acesso
-- -------------------------------------------------------------------------------------
-- Concessão de acesso é mutação crítica: passa por caso de uso no servidor que aplica
-- as regras anti-escalada de ACCESS_CONTROL §6. O banco bloqueia o caminho direto.

revoke all on public.companies, public.locations, public.company_members, public.platform_admins,
              public.app_modules, public.permissions, public.company_modules, public.roles,
              public.role_permissions, public.member_roles, public.member_permissions
  from anon;

revoke insert, update, delete, truncate
  on public.companies, public.locations, public.company_members, public.platform_admins,
     public.app_modules, public.permissions, public.company_modules, public.roles,
     public.role_permissions, public.member_roles, public.member_permissions
  from authenticated;

revoke select on public.platform_admins from authenticated;

grant select
  on public.companies, public.locations, public.company_members, public.app_modules,
     public.permissions, public.company_modules, public.roles, public.role_permissions,
     public.member_roles, public.member_permissions
  to authenticated;

-- -------------------------------------------------------------------------------------
-- 8. Seed do catálogo (EXEMPLO — substitua pelos módulos reais do produto)
-- -------------------------------------------------------------------------------------

insert into public.app_modules (key, name) values
  ('configuracoes', 'Configurações'),
  ('financeiro',    'Financeiro'),
  ('estoque',       'Estoque');

insert into public.permissions (key, module, description) values
  ('configuracoes.usuarios.ver',        'configuracoes', 'Ver usuários e acessos'),
  ('configuracoes.usuarios.editar',     'configuracoes', 'Convidar usuários e alterar acessos'),
  ('configuracoes.filiais.ver',         'configuracoes', 'Ver filiais'),
  ('configuracoes.filiais.editar',      'configuracoes', 'Criar e editar filiais'),
  ('financeiro.contas_pagar.ver',       'financeiro',    'Ver contas a pagar'),
  ('financeiro.contas_pagar.criar',     'financeiro',    'Lançar contas a pagar'),
  ('financeiro.contas_pagar.editar',    'financeiro',    'Editar contas a pagar em aberto'),
  ('financeiro.contas_pagar.baixar',    'financeiro',    'Dar baixa em contas a pagar'),
  ('financeiro.contas_pagar.exportar',  'financeiro',    'Exportar contas a pagar'),
  ('financeiro.contas_receber.ver',     'financeiro',    'Ver contas a receber'),
  ('financeiro.contas_receber.criar',   'financeiro',    'Lançar contas a receber'),
  ('financeiro.contas_receber.baixar',  'financeiro',    'Dar baixa em contas a receber'),
  ('financeiro.fornecedores.ver',       'financeiro',    'Ver fornecedores'),
  ('financeiro.fornecedores.editar',    'financeiro',    'Cadastrar e editar fornecedores'),
  ('estoque.produtos.ver',              'estoque',       'Ver produtos'),
  ('estoque.produtos.editar',           'estoque',       'Cadastrar e editar produtos'),
  ('estoque.movimentos.ver',            'estoque',       'Ver movimentações'),
  ('estoque.movimentos.criar',          'estoque',       'Lançar movimentações');

insert into public.roles (company_id, key, name) values
  (null, 'administrador', 'Administrador'),
  (null, 'financeiro',    'Financeiro'),
  (null, 'estoque',       'Estoque');

insert into public.role_permissions (role_id, permission)
select r.id, x.permission
  from public.roles r
  join (values
    ('administrador', '*'),
    ('financeiro',    'financeiro'),
    ('estoque',       'estoque')
  ) as x (role_key, permission) on x.role_key = r.key
 where r.company_id is null;
