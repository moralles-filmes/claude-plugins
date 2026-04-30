# Multi-Tenant Auditor — Referência

## Matriz de severidade

| # | Achado | Severidade | Razão |
|---|---|---|---|
| 1 | Tabela com dados de usuário SEM `company_id` | 🚨 BLOQUEANTE | Não há como filtrar por tenant |
| 2 | Tabela com `company_id` SEM trigger force | 🚨 BLOQUEANTE | Cliente pode setar tenant arbitrário |
| 3 | Tabela sem `FORCE ROW LEVEL SECURITY` | 🚨 BLOQUEANTE | Donos da tabela bypassam RLS |
| 4 | Função `SECURITY DEFINER` sem `search_path` | 🚨 BLOQUEANTE | Search-path hijack — CVE-grade |
| 5 | View sem `security_invoker = on` (PG15+) | 🚨 BLOQUEANTE | View vaza dados de outros tenants |
| 6 | `service_role` em código frontend | 🚨 BLOQUEANTE | Bypass total de RLS |
| 7 | Edge function com `service_role` aceitando `company_id` no body | 🚨 BLOQUEANTE | Vazamento cross-tenant trivial |
| 8 | Policy `USING (true)` ou `WITH CHECK (true)` em tabela tenant | 🚨 BLOQUEANTE | RLS desligado de fato |
| 9 | INSERT/UPDATE policy sem `WITH CHECK` | 🚨 BLOQUEANTE | Permite inserir linha em outro tenant |
| 10 | Resolver `get_current_company_id` é `VOLATILE` | 🟡 ATENÇÃO | Performance ruim mas funcional |
| 11 | Tabela sem índice em `company_id` | 🟡 ATENÇÃO | Performance — full scan em RLS |
| 12 | Frontend envia `company_id` no payload | 🟡 ATENÇÃO | Trigger sobrescreve — defesa em profundidade |
| 13 | Policies com nomes genéricos (`policy1`) | 🔵 INFO | Manutenibilidade |
| 14 | Comparação fora do resolver | 🔵 INFO | Refatorar para `get_current_company_id()` |

## Queries de auditoria SQL — para rodar no banco em revisão final

### Q1: Tabelas sem RLS
```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;
```

### Q2: Tabelas sem FORCE RLS
```sql
SELECT schemaname, tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND c.relforcerowsecurity = false
ORDER BY tablename;
```

### Q3: Tabelas com company_id mas sem trigger force_company_id
```sql
SELECT c.table_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'company_id'
  AND c.table_name NOT IN (
    SELECT DISTINCT event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE '%force_company_id%'
  )
ORDER BY c.table_name;
```

### Q4: Funções SECURITY DEFINER sem search_path
```sql
SELECT n.nspname AS schema, p.proname AS function,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname IN ('public', 'auth')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) cfg
    WHERE cfg LIKE 'search_path=%'
  );
```

### Q5: Tabelas company_id sem índice
```sql
SELECT c.table_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'company_id'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = c.table_name
      AND i.indexdef LIKE '%(company_id%' -- início do índice
  );
```

### Q6: Views sem security_invoker
```sql
SELECT schemaname, viewname,
       (reloptions::text LIKE '%security_invoker=on%') AS is_invoker
FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
WHERE schemaname = 'public'
  AND NOT (reloptions::text LIKE '%security_invoker=on%');
```

### Q7: Policies que podem estar muito permissivas
```sql
SELECT schemaname, tablename, policyname,
       cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true');
```

## Padrões de Edge Function seguros

### ❌ ANTI-PATTERN: service_role aceitando body
```ts
// Edge Function — VULNERÁVEL
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { company_id, payload } = await req.json()  // ❌ confia no cliente
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // ❌ ignora RLS
  )
  await supabase.from('invoices').insert({ company_id, ...payload })
  return new Response('ok')
})
```
Cliente pode passar `company_id` de qualquer outro tenant.

### ✅ PATTERN: forward auth header + RLS
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Cliente com JWT do usuário — RLS vai filtrar
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { payload } = await req.json()  // ✅ não recebe company_id
  // Trigger force_company_id pega o tenant via auth.uid()
  const { error } = await supabase.from('invoices').insert(payload)
  if (error) return new Response(error.message, { status: 400 })
  return new Response('ok')
})
```

### ✅ PATTERN: service_role para tarefas server-only
Use `service_role` SOMENTE para:
- Webhooks externos (Stripe, etc) onde JWT do usuário não existe
- Cron jobs / background tasks
- Migrations / setup

E SEMPRE valide o `company_id` derivado de fonte confiável (lookup em `customers` table pelo `stripe_customer_id`, por exemplo).

## Sinais de vazamento que aparecem em logs

Se você tem acesso a logs:
- Policies sendo retiradas (`DROP POLICY`) sem substituição
- Queries com `WHERE company_id IS NULL`
- Edge functions retornando 500 com mensagens "row not found" — pode ser tentativa de acesso a outro tenant
- Picos de queries em uma tabela específica para um único usuário — possível enumeration

## Pré-deploy: 30 segundos de verificação

```bash
# 1. Tabela órfã?
grep -L "FORCE ROW LEVEL SECURITY" supabase/migrations/*.sql | grep -v "^$"

# 2. service_role em frontend?
grep -rn "service_role\|SERVICE_ROLE_KEY" src/

# 3. Payload com company_id?
grep -rn "company_id:" src/ | grep -v "// audit-ok"
```

Se algum dos 3 retorna match, **não faça deploy**. Rode auditoria completa.
