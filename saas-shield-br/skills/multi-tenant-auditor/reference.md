# Multi-Tenant Auditor — Referência

> `<TC>` = coluna(s) de tenant do projeto; `<R>` = resolver canônico; `<WP>` = write_path (skill [tenant-model]). Os exemplos usam `company_id`/`get_current_company_id()`/force-trigger (Arquétipo A) **como ilustração** — troque pelos identificadores do `.claude/tenancy-profile.yml`. As **regras** são agnósticas de arquétipo.

## Matriz de severidade

| # | Achado | Sev | Razão |
|---|---|---|---|
| 1 | Tabela com dado de usuário SEM `<TC>` | P0/P1 | Não há como filtrar por tenant |
| 2 | Caminho de escrita ausente/permissivo p/ o `<WP>` declarado | P0/P1 | Cliente pode gravar em tenant alheio |
| 3 | Tabela sem `FORCE ROW LEVEL SECURITY` | P0/P1 | Dono da tabela bypassa RLS |
| 4 | `SECURITY DEFINER` sem `search_path` | P0 | Search-path hijack (CVE-grade) |
| 5 | View sem `security_invoker = on` (PG15+) | P0/P1 | Vaza dados de outros tenants |
| 6 | `service_role` em código cliente | P0 | Bypass total de RLS |
| 7 | Fronteira privilegiada com `service_role` aceitando `<TC>` do body sem revalidar | P0 | Vazamento cross-tenant trivial |
| 8 | Policy `USING (true)`/`WITH CHECK (true)` em tabela tenant | P0/P1 | RLS desligado de fato |
| 9 | INSERT/UPDATE policy sem `WITH CHECK` | P1 | Insere linha em outro tenant |
| 10 | Resolver `<R>` `VOLATILE` | P2 | Performance ruim mas funcional |
| 11 | Tabela sem índice em `<TC>` | P2 | Full scan em RLS |
| 12 | Cliente envia `<TC>` no payload | P2/P1 | Def. em profundidade (P1 se `<WP>` não é force-trigger) |
| 13 | Policies com nomes genéricos | P3 | Manutenibilidade |
| 14 | Comparação fora do resolver `<R>` | P2 | Reimplementação divergente |

## Queries de auditoria SQL (rodar no banco em revisão final)

Troque `company_id` pela sua `<TC>` e o nome do resolver/trigger pelos do projeto.

### Q1 — Tabelas sem RLS
```sql
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false ORDER BY tablename;
```

### Q2 — Tabelas com RLS mas sem FORCE
```sql
SELECT t.schemaname, t.tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
WHERE t.schemaname = 'public' AND t.rowsecurity = true AND c.relforcerowsecurity = false
ORDER BY t.tablename;
```

### Q3 — Tabelas com `<TC>` sem o caminho de escrita (só Arquétipo force-trigger)
```sql
SELECT c.table_name
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name = 'company_id'   -- sua <TC>
  AND c.table_name NOT IN (
    SELECT DISTINCT event_object_table FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name LIKE '%force%'
  ) ORDER BY c.table_name;
```
> Só aplique se `<WP> = force-trigger`. Em `server-scoped`/`rpc`, valide o caminho declarado.

### Q4 — Funções SECURITY DEFINER sem search_path
```sql
SELECT n.nspname AS schema, p.proname AS function
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true AND n.nspname IN ('public','auth','app')
  AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%');
```

### Q5 — Tabelas `<TC>` sem índice
```sql
SELECT c.table_name FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name = 'company_id'   -- sua <TC>
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname='public' AND i.tablename=c.table_name
      AND i.indexdef LIKE '%(company_id%');
```

### Q6 — Views sem security_invoker
```sql
SELECT schemaname, viewname FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
WHERE schemaname='public' AND NOT (reloptions::text LIKE '%security_invoker=on%');
```

### Q7 — Policies permissivas demais
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND (qual='true' OR with_check='true');
```

## Padrões de fronteira privilegiada

A fronteira depende de `secrets_boundary` (edge-function | route-handler | rpc), mas a falha é sempre a mesma: **`service_role`/admin client que confia no `<TC>` do body**.

### ❌ ANTI-PATTERN — confia no cliente (exemplo Edge Function)
```ts
const { company_id, payload } = await req.json()          // ❌ tenant do cliente
const supabase = createClient(URL, SERVICE_ROLE_KEY)       // ❌ ignora RLS
await supabase.from('invoices').insert({ company_id, ...payload })
```

### ✅ PATTERN — reencaminha o JWT do usuário e deixa a RLS filtrar
```ts
const authHeader = req.headers.get('Authorization')
if (!authHeader) return new Response('Unauthorized', { status: 401 })
const supabase = createClient(URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
const { payload } = await req.json()                       // ✅ não recebe <TC>
await supabase.from('invoices').insert(payload)            // servidor deriva o tenant
```
Equivalente em **Route Handler** (`app/api/.../route.ts`): use o client SSR com o cookie de sessão do usuário; use o admin client **só** para tarefas server-only, sempre com `.eq('<TC>')` derivado de fonte confiável. Equivalente em **RPC**: `SECURITY DEFINER` que resolve o tenant internamente, nunca por argumento do cliente.

### ✅ `service_role`/admin só para server-only
Webhooks externos (sem JWT do usuário), cron/background, setup/migrations. **Sempre** derive `<TC>` de fonte confiável (ex.: lookup por `stripe_customer_id`), nunca do body.

## Pré-deploy: verificação de 30s
```bash
# 1. Tabela sem FORCE RLS?
grep -L "FORCE ROW LEVEL SECURITY" supabase/migrations/*.sql
# 2. service_role no cliente? (ajuste as pastas ao framework)
grep -rn "service_role\|SERVICE_ROLE_KEY" src/ app/ components/ 2>/dev/null
# 3. Payload com a coluna de tenant? (troque company_id pela sua <TC>)
grep -rn "company_id:" src/ app/ 2>/dev/null | grep -v "// audit-ok"
```
Qualquer match → não faça deploy sem investigar.
