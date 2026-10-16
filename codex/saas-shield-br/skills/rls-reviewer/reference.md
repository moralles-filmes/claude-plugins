# RLS Reviewer — Referência Técnica

Referência completa do `rls-reviewer`. Carregue sob demanda.

> **Convenção:** `<TC>` = a(s) coluna(s) de tenant do projeto, `<R>` = o resolver canônico, `<WP>` = o caminho de escrita — tudo vindo do `.claude/tenancy-profile.yml` (skill [tenant-model]). Os exemplos corretos usam o **arquétipo E** (padrão do Padrão SaaS v3.2: `private.allowed_company_ids`/`allowed_location_ids`, `(select private.current_user_id())`). Os exemplos com `get_current_company_id()` ilustram o arquétipo A (legado). Os **anti-patterns** valem em qualquer arquétipo. Projeto com `docs/standards/`: as normas dele prevalecem.

## Modelo mental: as 4 camadas (parametrizado)

```
Cliente (frontend, com JWT)
        │  INSERT/UPDATE tentando setar <TC> arbitrário
        ▼
CAMADA 1 — COLUNA      <TC> not null  (+ FK para a tabela de tenant)
CAMADA 2 — ESCRITA     conforme <WP>:
                        • force-trigger  → BEFORE INSERT/UPDATE deriva <TC> do servidor; imutável no UPDATE
                        • server-scoped  → escrita só server-side; WITH CHECK barra tenant alheio
                        • rpc-sec-definer→ sem DML de cliente; RPC valida o tenant
CAMADA 3 — RLS+FORCE   ENABLE + FORCE ROW LEVEL SECURITY  ← afeta até o dono da tabela
CAMADA 4 — POLICIES    USING (<TC> ~ <R>)  +  WITH CHECK (<TC> ~ <R>)
        ▼
      Linha visível / aceita / negada
```

## Checklist

### Coluna (universal)
- [ ] Tabela tem `<TC>` `not null`?
- [ ] FK para a tabela de tenant declarada (com `on delete` explícito)?
- [ ] Índice em `<TC>` (ou composto começando por ele)?
- [ ] Sem `DEFAULT '<uuid-fixo>'` na coluna de tenant?

### Escrita — depende de `<WP>`
- **Se `force-trigger`**: trigger `BEFORE INSERT OR UPDATE` deriva `<TC>` de `<R>` no INSERT e preserva `OLD.<TC>` no UPDATE; função `SECURITY DEFINER` + `SET search_path`; não deixa `<TC>` do cliente passar quando `auth.uid()` é NULL.
- **Se `server-scoped`**: não há policy de INSERT permissiva demais; `WITH CHECK` amarra a `<R>`; no E, o cliente grava direto só nas colunas com grant (estado fora), e escrita com service role no servidor filtra o tenant explicitamente.
- **Se `rpc-security-definer`**: a tabela **não** tem policy de escrita para `authenticated`; toda mutação passa por RPC `SECURITY DEFINER` que valida o tenant internamente.

> Não penalize a ausência de force-trigger fora do Arquétipo A. Valide **o caminho declarado**.

### RLS (universal)
- [ ] `ENABLE ROW LEVEL SECURITY`?
- [ ] `FORCE ROW LEVEL SECURITY`?
- [ ] Schema `public` (ou auditado se outro)?

### Policies (universal)
- [ ] SELECT com `USING (<TC> ~ <R>)`?
- [ ] INSERT com `WITH CHECK (<TC> ~ <R>)`?
- [ ] UPDATE com **ambos** `USING` e `WITH CHECK`?
- [ ] DELETE com `USING (<TC> ~ <R>)`?
- [ ] Nenhuma `USING (true)` / `WITH CHECK (true)`?
- [ ] `TO authenticated` (não `TO public`)?
- [ ] Ramo de super-admin explícito (autoridade separada) OU super barrado?
- [ ] Nomes descritivos (`<table>_select_own_tenant`)?

### Grants (universal)
- [ ] `revoke all … from anon, authenticated` e grant mínimo na mesma migration (não depende dos default privileges do Supabase)? Ausente → P2.
- [ ] Coluna de estado de transição crítica sem grant de update para `authenticated` (grant por coluna)? Com grant → P1.
- [ ] Funções com `revoke execute … from public` (e `anon`) e grant explícito?

### Resolver `<R>` (universal)
- [ ] Existe e é `STABLE SECURITY DEFINER`?
- [ ] `SET search_path = ''` com nomes qualificados? (`= public` → P2)
- [ ] Fora do schema exposto (`private` no E)?
- [ ] Autoridade correta ao `resolver_kind`: JWT `app_metadata` (nunca `user_metadata`) | membership-lookup | set-returning?
- [ ] Para mutações críticas, há variante estrita que nega quando sem vínculo?

## Os 12 anti-patterns 🚨 (universais)

### #1 — `USING (true)`
```sql
CREATE POLICY "all_access" ON public.invoices FOR SELECT USING (true);  -- ❌
```
Equivale a desligar RLS. Se a intenção era pular RLS, use `service_role` server-side.

### #2 — INSERT sem `WITH CHECK`
`USING` não roda em INSERT → o cliente insere linha de qualquer tenant.
```sql
-- ✅
CREATE POLICY "invoices_insert_own_tenant" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());   -- troque pelos seus <TC>/<R>
```

### #3 — UPDATE só com `USING`
Permite mover linha entre tenants. Sempre `USING + WITH CHECK`.

### #4 — `SECURITY DEFINER` sem `search_path`
Atacante cria schema com função homônima e sequestra o `search_path` da sessão.
```sql
-- ✅ search_path vazio + nomes qualificados
create or replace function private.user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id from public.company_members m
   where m.user_id = (select private.current_user_id()) and m.status = 'active'
$$;
```

### #5 — Resolver `VOLATILE`
Sem `STABLE`, o planner re-executa por linha → RLS ~100x mais lento em tabelas grandes.

### #6 — RLS sem `FORCE`
`ROW LEVEL SECURITY` sozinho não afeta o dono da tabela; funções `SECURITY DEFINER` mal escritas leem tudo.
```sql
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
```

### #7 — View sem `security_invoker`
PG15+. View roda com permissão de quem a criou, não de quem consulta → vaza dados de RLS.
```sql
CREATE VIEW public.invoices_summary WITH (security_invoker = on) AS SELECT ...;
```

### #8 — Comparação fora do resolver
```sql
USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))  -- ❌
```
Cada policy reimplementa a lógica; bug em uma não propaga fix. Sempre via `<R>`. No E, também não reimplemente a regra de concessão: use `private.allowed_company_ids`/`allowed_location_ids`.

### #9 — Caminho de escrita permissivo demais
Trigger que passa `<TC>` do cliente quando `auth.uid()` é NULL; RPC `SECURITY DEFINER` que não valida o tenant; escrita server-side sem `.eq(<TC>)`. Qualquer um vira bypass.

### #10 — Tabela sem índice em `<TC>`
RLS vira full scan + filter.
```sql
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices (company_id);
```

### #11 — `service_role` no frontend
A `service_role` ignora RLS. Se está no env do cliente (`VITE_*`/`NEXT_PUBLIC_*`), qualquer usuário lê/escreve tudo. `service_role` só server-side.

### #12 — Policy sem role específico (`TO public`)
Aplica até para anônimos. Sempre `TO authenticated` (ou role específico).

## Arquétipo E — checagens adicionais

| Checagem | Severidade se falhar |
|---|---|
| Policy de tabela da empresa usa `company_id in (select private.allowed_company_ids('<mod>.<sub>.<acao>'))` | P1 |
| Policy de tabela da filial usa `location_id in (select private.allowed_location_ids('<mod>.<sub>.<acao>'))` + FK composta `(company_id, location_id)` → `locations (company_id, id)` | P1 |
| Leitura usa a ação `ver` do submódulo dono da tabela | P2 |
| Insert/update de cadastro compartilhado usa `allowed_company_ids('…', true)` | P2 |
| Helper chamado dentro de `(select …)` | P2 (desempenho) |
| Chave de permissão usada existe no catálogo `public.permissions` | P1 (concessão nunca casa) |
| Tabelas de acesso (`company_members`, `member_roles`, `member_permissions`, `role_permissions`, `roles`) sem grant de escrita para `authenticated` | P0 |
| `auth.uid()` direto em policy/helper fora do adapter de identidade | P3 (portabilidade) |
| FK de usuário para `auth.users` em vez de `public.app_users` | P3 (portabilidade) |
| Policy que libera o administrador da plataforma (`is_platform_admin()`) em tabela de tenant | P1 (super admin é barrado nas policies de tenant) |

## Template de policy correta (arquétipo E)

```sql
alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;

create policy suppliers_select on public.suppliers for select to authenticated
  using (company_id in (select private.allowed_company_ids('financeiro.fornecedores.ver')));

create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)));

create policy suppliers_update on public.suppliers for update to authenticated
  using      (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)))
  with check (company_id in (select private.allowed_company_ids('financeiro.fornecedores.editar', true)));

revoke all on public.suppliers from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;

create index suppliers_company_idx on public.suppliers (company_id);
```

Templates completos (empresa, filial, RPC de transição, N:N, audit log, view): `templates.md` da skill [supabase-migrator].

## Template de policy correta (arquétipo A — legado)

Para os arquétipos B (`unit_id`/membership), C (`org+unit`/RBAC) e D (`unit_id`/set), veja `reference.md` da skill [tenant-model]. Exemplo do arquétipo A:

```sql
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own_tenant" ON public.invoices
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE POLICY "invoices_insert_own_tenant" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "invoices_update_own_tenant" ON public.invoices
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "invoices_delete_own_tenant" ON public.invoices
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices (company_id);
```

## EXPLAIN ANALYZE em policy suspeita

```sql
SET role authenticated;
SET request.jwt.claims = '{"sub":"<uuid-de-um-usuario-real>"}';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.invoices LIMIT 10;
RESET role;
```
`Filter: (<TC> = ...)` com `Rows Removed by Filter` alto = RLS ok mas índice ausente.
