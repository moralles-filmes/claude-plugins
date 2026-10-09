# Supabase Migrator — Templates (Padrão SaaS v3.2, arquétipo E)

Templates do arquétipo E: `company_id` + `location_id`, membership consultada no banco e permissões `<modulo>.<submodulo>.<acao>`. A implementação de referência (helpers, tabelas de acesso e testes pgTAP) está em `padrao-saas/skills/aplicar/templates/sql/`; estes templates pressupõem que ela já foi aplicada.

**Se o projeto tem `docs/standards/`, as normas dele (DATABASE, MULTI_TENANCY, ACCESS_CONTROL e as "Particularidades") prevalecem sobre este arquivo.**

Placeholders: `<tabela>`, `<modulo>`, `<sub>` (submódulo), `<acao>`. Troque `<…>` e ajuste as colunas. Cada template é uma migration completa: o hook `check-sql-antipattern.mjs` aceita todos.

| # | Template | Quando |
|---|---|---|
| 0 | Catálogo de permissões | Módulo ou submódulo novo |
| 1 | Tabela da empresa | Cadastro compartilhado por todas as filiais |
| 2 | Tabela da filial | Dado operacional (pedido, caixa, conta, estoque) |
| 3 | Transição crítica por RPC | Coluna de estado (baixar, aprovar, cancelar, estornar) |
| 4 | Relação N:N no tenant | Junção entre duas tabelas da mesma empresa |
| 5 | Audit log | Ações sensíveis (SECURITY §4.2) |
| 6 | View | Leitura agregada que respeita a RLS |
| — | Notas | Soft delete, materialized view, modelo A de RPC, arquétipos legados A–D |

## Template 0 — Catálogo de permissões

O catálogo é escrito só por migration. Toda chave usada em policy, RPC ou `can()` existe aqui antes.

```sql
-- Migration: catálogo do módulo <modulo>
insert into public.app_modules (key, name) values
  ('<modulo>', '<Nome do módulo>')
on conflict (key) do nothing;

insert into public.permissions (key, module, description) values
  ('<modulo>.<sub>.ver',    '<modulo>', 'Ver <…>'),
  ('<modulo>.<sub>.criar',  '<modulo>', 'Lançar <…>'),
  ('<modulo>.<sub>.editar', '<modulo>', 'Editar <…> em aberto'),
  ('<modulo>.<sub>.<acao>', '<modulo>', '<Ação crítica sobre …>')
on conflict (key) do nothing;
```

Reutilize as ações padrão (`ver`, `criar`, `editar`, `excluir`, `aprovar`, `baixar`, `estornar`, `cancelar`, `exportar`) antes de inventar outra (ACCESS_CONTROL §2). Depois regenere o tipo TypeScript das chaves.

## Template 1 — Tabela da empresa

```sql
-- Migration: <descrição PT-BR>
-- Arquétipo: E | Módulo: <modulo> | Tabela da EMPRESA

create table public.<tabela> (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name       text not null,
  -- … campos do domínio
  created_at timestamptz not null default now(),
  unique (company_id, id)  -- alvo das FKs compostas que apontam para esta tabela
);
create index <tabela>_company_idx on public.<tabela> (company_id);

comment on table public.<tabela> is '<descrição PT-BR>';

alter table public.<tabela> enable row level security;
alter table public.<tabela> force row level security;

create policy <tabela>_select on public.<tabela> for select to authenticated
  using (company_id in (select private.allowed_company_ids('<modulo>.<sub>.ver')));

-- true = exige concessão para a empresa inteira: usuário restrito a uma filial
-- não altera cadastro compartilhado por todas as filiais.
create policy <tabela>_insert on public.<tabela> for insert to authenticated
  with check (company_id in (select private.allowed_company_ids('<modulo>.<sub>.criar', true)));

create policy <tabela>_update on public.<tabela> for update to authenticated
  using      (company_id in (select private.allowed_company_ids('<modulo>.<sub>.editar', true)))
  with check (company_id in (select private.allowed_company_ids('<modulo>.<sub>.editar', true)));

-- Sem policy de delete: exclusão é rara (prefira status + cancelar). Se precisar,
-- policy for delete com a ação `excluir` e grant de delete.

-- Grants explícitos: não dependa dos default privileges do Supabase.
revoke all on public.<tabela> from anon, authenticated;
grant select, insert, update on public.<tabela> to authenticated;
```

O cliente pode **indicar** `company_id` no insert (a empresa ativa vem da URL). O `with check` confirma que o usuário tem a permissão naquela empresa; valor de outra empresa é rejeitado.

## Template 2 — Tabela da filial

```sql
-- Migration: <descrição PT-BR>
-- Arquétipo: E | Módulo: <modulo> | Tabela da FILIAL

create table public.<tabela> (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  location_id  uuid not null,
  <ref>_id     uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  status       text not null default 'open' check (status in ('open', 'done', 'canceled')),
  created_at   timestamptz not null default now(),
  unique (company_id, id),
  -- FK composta: filial e referência precisam ser da MESMA empresa da linha.
  -- Checagens de FK ignoram RLS; sem isto, uma linha de A pode apontar para filial de B.
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, <ref>_id) references public.<tabela_ref> (company_id, id)
);
create index <tabela>_location_idx on public.<tabela> (location_id);
create index <tabela>_company_idx  on public.<tabela> (company_id);

alter table public.<tabela> enable row level security;
alter table public.<tabela> force row level security;

-- A policy olha só location_id: a FK composta amarra company_id à empresa da filial.
create policy <tabela>_select on public.<tabela> for select to authenticated
  using (location_id in (select private.allowed_location_ids('<modulo>.<sub>.ver')));

create policy <tabela>_insert on public.<tabela> for insert to authenticated
  with check (location_id in (select private.allowed_location_ids('<modulo>.<sub>.criar')));

create policy <tabela>_update on public.<tabela> for update to authenticated
  using      (location_id in (select private.allowed_location_ids('<modulo>.<sub>.editar')))
  with check (location_id in (select private.allowed_location_ids('<modulo>.<sub>.editar')));

-- Escrita direta só nas colunas editáveis. status, empresa e filial nunca mudam pelo cliente:
-- a transição de status é o Template 3.
revoke all on public.<tabela> from anon, authenticated;
grant select on public.<tabela> to authenticated;
grant insert (company_id, location_id, <ref>_id, amount_cents) on public.<tabela> to authenticated;
grant update (<ref>_id, amount_cents) on public.<tabela> to authenticated;
```

## Template 3 — Transição crítica por RPC

Modelo B de DATABASE §4: o usuário chama a função direto; ela confere a ação no próprio `where`. Use quando não há servidor próprio (SPA + Supabase) ou a regra cabe numa função.

```sql
-- Migration: <acao> de <entidade> por RPC
-- Arquétipo: E | Transição crítica: status open → done

create or replace function public.<acao>_<entidade>(p_id uuid)
returns public.<tabela>
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.<tabela>;
begin
  update public.<tabela> t
     set status = 'done'
   where t.id = p_id
     and t.status = 'open'
     and t.location_id in (select private.allowed_location_ids('<modulo>.<sub>.<acao>'))
  returning t.* into v_row;

  if not found then
    -- Mesma mensagem para "não existe", "já processado" e "sem permissão": não revela existência.
    raise exception '<ENTIDADE>_INDISPONIVEL' using errcode = 'P0002';
  end if;

  -- Na mesma transação: audit log (Template 5) e outbox, quando houver efeito externo.
  return v_row;
end;
$$;

revoke all on function public.<acao>_<entidade>(uuid) from public, anon;
grant execute on function public.<acao>_<entidade>(uuid) to authenticated;
```

Funções `security definer` ficam em `public` só quando são a API intencional (RPC). Helpers internos vão em `private`.

## Template 4 — Relação N:N no tenant

```sql
-- Migration: relação <a> × <b>
create table public.<a>_<b> (
  company_id uuid not null,
  <a>_id     uuid not null,
  <b>_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, <a>_id, <b>_id),
  foreign key (company_id, <a>_id) references public.<a> (company_id, id) on delete cascade,
  foreign key (company_id, <b>_id) references public.<b> (company_id, id) on delete cascade
);
create index <a>_<b>_<b>_idx on public.<a>_<b> (<b>_id);

alter table public.<a>_<b> enable row level security;
alter table public.<a>_<b> force row level security;

create policy <a>_<b>_select on public.<a>_<b> for select to authenticated
  using (company_id in (select private.allowed_company_ids('<modulo>.<sub>.ver')));
create policy <a>_<b>_insert on public.<a>_<b> for insert to authenticated
  with check (company_id in (select private.allowed_company_ids('<modulo>.<sub>.editar', true)));
create policy <a>_<b>_delete on public.<a>_<b> for delete to authenticated
  using (company_id in (select private.allowed_company_ids('<modulo>.<sub>.editar', true)));

revoke all on public.<a>_<b> from anon, authenticated;
grant select, insert, delete on public.<a>_<b> to authenticated;
```

## Template 5 — Audit log de negócio

Formato de SECURITY §4.2. Só inserção; quem grava é a RPC ou o caso de uso, **na mesma transação** da mudança.

```sql
-- Migration: audit log
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete restrict,
  location_id uuid,
  actor_type  text not null check (actor_type in ('user', 'api_key', 'system', 'platform')),
  actor_id    uuid,
  action      text not null,                  -- chave de permissão ou evento
  entity      text not null,
  entity_id   uuid,
  summary     jsonb not null default '{}',    -- antes/depois resumido, sem segredo
  request_id  text,
  created_at  timestamptz not null default now(),
  foreign key (company_id, location_id) references public.locations (company_id, id)
);
create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy audit_log_select on public.audit_log for select to authenticated
  using (company_id in (select private.allowed_company_ids('<permissao_de_auditoria>.ver')));

-- Nenhum papel de aplicação altera ou apaga. Inserção só pelas funções/casos de uso.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
```

Dentro da RPC (Template 3), depois da mudança:

```sql
insert into public.audit_log (company_id, location_id, actor_type, actor_id, action, entity, entity_id, summary)
values (v_row.company_id, v_row.location_id, 'user', (select private.current_user_id()),
        '<modulo>.<sub>.<acao>', '<tabela>', v_row.id, jsonb_build_object('status', 'done'));
```

## Template 6 — View

```sql
-- Migration: resumo diário de <tabela>
create view public.<tabela>_resumo
with (security_invoker = true) as   -- sem isto a view roda como o dono e ignora a RLS
select company_id, location_id, date_trunc('day', created_at)::date as dia, count(*) as total
  from public.<tabela>
 group by company_id, location_id, date_trunc('day', created_at)::date;

revoke all on public.<tabela>_resumo from anon, authenticated;
grant select on public.<tabela>_resumo to authenticated;
```

A RLS libera todas as empresas do usuário: a tela filtra pela empresa ativa (ACCESS_CONTROL §7).

## Notas

**Soft delete.** Prefira `status` + RPC `cancelar` (o lançamento confirmado não some; corrige-se por estorno, DATABASE §7). Se precisar de `deleted_at`, a policy de select ganha `and deleted_at is null`, a coluna sai do grant de update e a marcação passa por RPC.

**Materialized view.** Não tem RLS. Não dê `select` a `authenticated`; leia por função `security definer` com `set search_path = ''` que filtra `company_id in (select private.allowed_company_ids('<…>.ver'))`. Refresh por pg_cron.

**RPC chamada pelo servidor (modelo A de DATABASE §4).** O caso de uso autentica, resolve o tenant e autoriza; depois chama a função passando o `company_id` resolvido. A função é `security invoker`, `set search_path = ''`, filtra `company_id = p_company_id` em toda query e tem `execute` revogado de `public, anon, authenticated`. Exemplo completo com idempotência e outbox em DATABASE §4.

**updated_at.** O Padrão não exige. Se o projeto usa, o trigger é `security invoker` e a função tem `set search_path = ''`.

### Arquétipos legados (A–D)

Só para projeto que já declara outro arquétipo no profile. Os invariantes não mudam: `enable` + `force`, policies `to authenticated` com `with check`, `set search_path = ''`, grants explícitos, FK composta com a coluna de tenant, helpers dentro de `(select …)`.

- **A** — `company_id` + claim de JWT: policies com `company_id = (select public.get_current_company_id())`; trigger `force_company_id` deriva o tenant no insert e o congela no update.
- **B** — `unit_id` + membership: `public.is_unit_member((select auth.uid()), unit_id)`; escrita server-scoped, sem trigger.
- **C** — `organization_id` + `unit_id` + RBAC: `has_permission('<chave>', organization_id, unit_id)`; tabelas sensíveis sem policy de escrita, mutação só por RPC.
- **D** — `unit_id` + conjunto: `unit_id in (select app.current_unit_ids())`; escrita server-scoped com `.eq('unit_id')`.

Nesses projetos, `auth.uid()` direto é a convenção existente: mantenha. Trocar por `private.current_user_id()` é migração planejada, não efeito colateral. Templates de resolver de cada um: `reference.md` da skill [tenant-model].
