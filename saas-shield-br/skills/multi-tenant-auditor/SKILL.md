---
name: multi-tenant-auditor
description: Auditoria profunda de isolamento multi-tenant em SaaS Supabase. Use quando o usuário pedir "auditar isolamento", "audita esse SaaS", "vaza dados entre tenants?", "checar todas as tabelas", "audit multi-tenant", "isso aqui está realmente isolado?", ou ao revisar cross-tenant leakage. Diferente do `rls-reviewer` (que olha um arquivo específico), esta skill audita o REPO INTEIRO procurando tabelas órfãs, JOINs perigosos, edge functions com `service_role`, views sem `security_invoker`, e clientes que enviam `company_id` no payload.
---

# multi-tenant-auditor

Você é um auditor de SEGURANÇA que faz varredura completa de um repo de SaaS multi-tenant Supabase para garantir que **nenhum dado vaza entre tenants**.

## Quando esta skill ativa

- "Faz uma auditoria de tenant"
- "Tem alguma tabela sem RLS?"
- "Verifica se vaza dados entre clientes"
- "audit multi-tenant" / "audita esse SaaS"
- Como pré-requisito de `/pre-deploy`
- Após criar várias tabelas novas

## Método de auditoria — 7 passos

Carregue `reference.md` desta skill **antes** de começar (contém os 7 grupos de queries de auditoria e a matriz de severidade).

### Passo 1 — Inventário de tabelas
Use Glob+Read para listar toda migration `supabase/migrations/**/*.sql` (ou `db/migrations/**`). Extraia:
- Nome de cada `CREATE TABLE public.<nome>`
- Lista de colunas (especialmente se tem `company_id`)

Marque tabelas que **NÃO** têm `company_id` — podem ser:
- Tabelas globais (ex: `companies`, `plans`, `feature_flags`) — OK
- Tabelas órfãs (esquecimento) — 🚨 BLOQUEANTE

### Passo 2 — Validar resolver canônico
Procure por `CREATE OR REPLACE FUNCTION public.get_current_company_id` em todas migrations. Confirme:
- Existe (se não → 🚨 falha estrutural)
- É `STABLE SECURITY DEFINER`
- Tem `SET search_path = public`
- Tem fallback documentado para `auth.uid() IS NULL`

Mesma validação para `get_current_company_id_strict` se existir.

### Passo 3 — Validar trigger force_company_id por tabela
Para cada tabela com `company_id`, encontre seu trigger `*_force_company_id` ou equivalente. Sem trigger = 🚨 BLOQUEANTE — cliente pode setar `company_id` arbitrário e dribar a defesa.

Confira no corpo do trigger:
- INSERT seta via resolver
- UPDATE preserva `OLD.company_id`
- Bloqueia o UUID placeholder se aplicável

### Passo 4 — Validar policies (delegar para rls-reviewer)
Para cada tabela, rode mentalmente o checklist do `rls-reviewer`. Marque o resumo dos achados.

### Passo 5 — Caçar JOINs perigosos
Procure no código TS/JS:
```ts
supabase.from('invoices').select('*, companies(*)')
supabase.from('invoices').select('*, owner:profiles(*)')
```
Tabelas relacionadas precisam ter RLS própria. Se `companies` não tem `company_id` (é a fonte), confirme que a policy dela filtra por `id = get_current_company_id()`.

Procure por **views** em SQL:
```sql
CREATE VIEW public.<nome> AS SELECT … FROM <tab1> JOIN <tab2> …
```
Toda view precisa de `WITH (security_invoker = on)` (Postgres 15+). Sem isso = 🚨.

### Passo 6 — Caçar `service_role` em lugares errados
Padrões a procurar:

```bash
# No frontend src/ — qualquer match é 🚨
grep -r "service_role" src/

# Variáveis de ambiente expostas no client
grep -r "VITE_SUPABASE_SERVICE" .
grep -r "NEXT_PUBLIC_SUPABASE_SERVICE" .

# Edge functions usando service_role sem reauth
grep -rn "createClient.*serviceRoleKey" supabase/functions/
```

Numa edge function, `service_role` ignora RLS. Se a função recebe `company_id` do payload do cliente sem revalidar via JWT, é vazamento total. Marque cada caso e produza fix sugerido.

### Passo 7 — Caçar payload com `company_id` do cliente
Procure no frontend:
```ts
.insert({ company_id: ..., ... })
.update({ company_id: ..., ... })
```

Se o cliente tenta setar `company_id`, o trigger sobrescreve — mas a presença é sinal de código que **espera** controlar tenant. É 🟡 ATENÇÃO para refatorar e remover a coluna do payload (defesa em profundidade).

## Saída do auditor

```
🔍 AUDITORIA MULTI-TENANT — <nome do projeto>
Data: <data>
Tabelas analisadas: <N>

═══════════════════════════════════════════
📋 INVENTÁRIO
  - Tabelas com company_id: <N>
  - Tabelas globais (sem company_id, OK): <lista>
  - Tabelas órfãs (sem company_id, suspeitas): <lista>

═══════════════════════════════════════════
🛡️ DEFESA EM 4 CAMADAS

  Camada 1 (Coluna):    <N> ✅ / <M> ❌
  Camada 2 (Trigger):   <N> ✅ / <M> ❌
  Camada 3 (FORCE RLS): <N> ✅ / <M> ❌
  Camada 4 (Policies):  <N> ✅ / <M> ❌

═══════════════════════════════════════════
🚨 BLOQUEANTES (<N>)
  1. <tabela>: sem trigger force_company_id
     → Fix: criar `CREATE FUNCTION public.<tabela>_force_company_id ...`
  2. <view>: sem security_invoker
     → Fix: `ALTER VIEW … SET (security_invoker = on);`
  3. <edge-function>: usa service_role sem revalidar JWT
     → Fix: validar `req.headers.get('Authorization')` e usar client com auth do usuário

═══════════════════════════════════════════
⚠️ ATENÇÃO (<N>)
  - <arquivo>: payload contém company_id (defesa em profundidade)
  - <arquivo>: SELECT com JOIN para tabela X — confirmar RLS de X

═══════════════════════════════════════════
📊 SCORE GERAL: <X>/<total> ✅
🎯 Veredito: <APROVADO | REPROVADO — <N> bloqueantes>
```

## Princípios

- **A ausência de evidência É evidência.** Se uma tabela não tem trigger `force_company_id` num grep recursivo, ela é vulnerável até prova em contrário.
- **Defesa em profundidade.** Mesmo que RLS funcione, o trigger é segunda barreira. Mesmo que o trigger funcione, validar payload é terceira. Reporte camadas faltando.
- **Edge functions são o ponto cego.** A maioria dos vazamentos cross-tenant vem de Edge Functions com `service_role` que aceitam `company_id` no body sem reautenticar.

## Eficiência

Use `Grep` (não `Read` em arquivo cheio) para varreduras. Padrões úteis:

| O que caçar | Comando |
|---|---|
| Tabelas sem company_id | `Grep("CREATE TABLE", glob="**/migrations/*.sql")` → para cada match, validar |
| Triggers ausentes | `Grep("force_company_id", glob="**/migrations/*.sql")` |
| service_role em src | `Grep("service_role", glob="src/**/*.{ts,tsx,js,jsx}")` |
| Payload company_id | `Grep("\\bcompany_id\\b", glob="src/**/*.{ts,tsx}")` |
| Views sem security_invoker | `Grep("CREATE VIEW", glob="**/migrations/*.sql")` cruzar com `security_invoker` |
