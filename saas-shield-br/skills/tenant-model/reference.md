# tenant-model — arquétipos de referência

Quatro arquétipos reais, extraídos de projetos em produção. Todos satisfazem os **invariantes universais** do `SKILL.md`; divergem no formato do tenant, no resolver e no caminho de escrita. Use-os para (a) reconhecer o padrão do projeto ao detectar, (b) escolher template ao gerar em greenfield.

Legenda do profile em cada bloco: `columns / resolver_kind / write_path / membership`.

---

## Arquétipo A — `company_id` + JWT claim + force-trigger

`[company_id] / jwt-claim / force-trigger / multi (1 ativo por vez)`

O tenant vem de um claim de JWT (com fallback para a membership ativa). Trigger deriva `company_id` no INSERT e o congela no UPDATE. É o padrão "MarginPro/Moralles Food".

```sql
create or replace function public.get_current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'company_id')::uuid,
    (select company_id from public.user_company_memberships
       where user_id = auth.uid() and active order by created_at limit 1)
  )
$$;

create trigger t_force before insert or update on public.<tabela>
  for each row execute function public.force_company_id();   -- deriva no INSERT, imutável no UPDATE

create policy p_sel on public.<tabela> for select
  using (company_id = public.get_current_company_id());
create policy p_ins on public.<tabela> for insert
  with check (company_id = public.get_current_company_id());
```

**Quando escolher**: SaaS B2B onde o usuário opera 1 empresa por vez, claim de tenant no token. **Cuidado**: o claim precisa vir de `app_metadata` (não `user_metadata`, que o usuário edita).

---

## Arquétipo B — `unit_id` + membership-lookup (boolean)

`[unit_id] (org→unit→member) / membership-lookup / server-scoped / multi`

Sem claim de tenant. O resolver é um **predicado** que verifica se o usuário é membro da unidade. Hierarquia `organizations → units → unit_members`. Sem force-trigger — a escrita é validada por `WITH CHECK` + o servidor informa a unidade.

```sql
create or replace function public.is_unit_member(p_user uuid, p_unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.unit_members
                 where user_id = p_user and unit_id = p_unit)
$$;

create policy p_sel on public.<tabela> for select
  using (public.is_unit_member(auth.uid(), unit_id));
create policy p_ins on public.<tabela> for insert
  with check (public.is_unit_member(auth.uid(), unit_id));
-- super admin: policy separada usando is_platform_admin()
```

**Quando escolher**: rede com matriz/filiais, usuário em várias unidades, papéis por unidade. Super admin em tabela dedicada (`platform_admins`), com policy-contraparte em cada tabela.

---

## Arquétipo C — `organization_id` + `unit_id` + RBAC por tabelas

`[organization_id, unit_id] / membership-lookup / rpc-security-definer / multi`

Tenant em **duas camadas**. Autorização por RBAC granular (`roles`/`permissions`/`role_permissions`/`user_roles`). Escrita de dados sensíveis **só via RPC `SECURITY DEFINER`** (zero DML direto do cliente); consistência de escopo por FKs compostas + trigger `block_scope_change`.

```sql
create or replace function public.has_permission(p_key text, p_org uuid, p_unit uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions pm on pm.id = rp.permission_id
    where ur.user_id = (select auth.uid())
      and pm.key = p_key
      and ur.organization_id = p_org
      and (ur.unit_id is null or ur.unit_id = p_unit))
$$;

-- catálogo: DML direto sob RLS
create policy p on public.<catalogo> for all
  using (public.has_permission('catalog.read', organization_id, unit_id))
  with check (public.has_permission('catalog.write', organization_id, unit_id));
-- núcleo RBAC/financeiro: SEM policy de escrita; mutação só por RPC security definer
```

**Quando escolher**: multiempresa + multiunidade + permissões finas; arquiteturas local-first/enterprise.

---

## Arquétipo D — `unit_id` + resolver set-returning + helpers `app.*`

`[unit_id] / set / server-scoped / multi`

O resolver retorna o **conjunto** de unidades do usuário; policies usam `= ANY(...)`. Helpers no schema `app.*` (anti-recursão). Super admin por flag em `user_profiles`. Escrita privilegiada server-side com `.eq('unit_id')` explícito.

```sql
create or replace function app.current_unit_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select unit_id from public.user_unit_roles where user_id = (select auth.uid())
$$;

create or replace function app.has_role(p_unit uuid, p_level int)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_unit_roles
                 where user_id = (select auth.uid()) and unit_id = p_unit and level <= p_level)
$$;

create policy p_sel on public.<tabela> for select
  using (unit_id in (select app.current_unit_ids()));
create policy p_wr on public.<tabela> for all
  using (app.has_role(unit_id, 2)) with check (app.has_role(unit_id, 1));
```

**Quando escolher**: multi-tenant com troca de workspace, papéis por nível numérico (1=admin…), Next.js server-first + `service_role` com `.eq('unit_id')`.

---

## Tabela-resumo (para detecção rápida)

| Sinal no código | Arquétipo provável |
|---|---|
| `get_current_company_id()`, claim `app_metadata.company_id`, `force_company_id` trigger | **A** |
| `is_unit_member(uid, unit)` boolean, `unit_members`, `organizations`+`units` | **B** |
| `has_permission(key, org, unit)`, `roles`/`permissions`/`role_permissions`, escrita por RPC | **C** |
| `current_unit_ids()` setof, `= any(...)`, helpers `app.*`, `user_profiles.is_super_admin` | **D** |

Se o projeto não bate exatamente com nenhum, é um **híbrido** — descreva-o no `tenancy-profile` combinando os campos. O profile é a autoridade; os arquétipos são só atalhos de reconhecimento.
