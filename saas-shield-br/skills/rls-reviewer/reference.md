# RLS Reviewer — Referência Técnica

Esta é a referência completa do `rls-reviewer`. Carregue sob demanda quando precisar do checklist ou da lista de anti-patterns.

## Modelo mental: as 4 camadas

```
Cliente (frontend, com JWT)
        │
        ▼ INSERT/UPDATE com company_id qualquer
        │
┌───────────────────────┐
│  CAMADA 1: COLUNA     │ company_id uuid NOT NULL REFERENCES companies(id)
│  Estrutural           │ Não pode ser NULL, FK garante existência
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  CAMADA 2: TRIGGER    │ BEFORE INSERT/UPDATE
│  Defesa server-side   │   IF auth.uid() IS NOT NULL THEN
│                       │     IF TG_OP = 'INSERT' THEN
│                       │       NEW.company_id := get_current_company_id();
│                       │     ELSIF TG_OP = 'UPDATE' THEN
│                       │       NEW.company_id := OLD.company_id;  -- imutável
│                       │     END IF;
│                       │   END IF;
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  CAMADA 3: RLS+FORCE  │ ENABLE ROW LEVEL SECURITY
│                       │ FORCE ROW LEVEL SECURITY  ← afeta até dono da tabela
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  CAMADA 4: POLICIES   │ USING       (company_id = get_current_company_id())
│                       │ WITH CHECK  (company_id = get_current_company_id())
└───────────────────────┘
        │
        ▼
       Linha visível / aceita / negada
```

## Checklist (24 itens)

### Estrutural — Coluna (4 itens)

- [ ] Tabela tem coluna `company_id uuid NOT NULL`?
- [ ] FK referenciando `public.companies(id)` declarada?
- [ ] Existe índice em `company_id` (ou index composto começando com ele)?
- [ ] Default da coluna é `NULL` ou inexistente (não `DEFAULT 'algum-uuid'`)?

### Trigger (5 itens)

- [ ] Existe trigger `<tabela>_force_company_id` `BEFORE INSERT OR UPDATE`?
- [ ] Trigger usa `public.get_current_company_id()` no INSERT?
- [ ] Trigger preserva `OLD.company_id` no UPDATE (imutável)?
- [ ] Trigger bloqueia o UUID placeholder `00000000-0000-0000-0000-000000000001` em produção?
- [ ] Função do trigger é `SECURITY DEFINER` com `SET search_path = public`?

### RLS (3 itens)

- [ ] `ALTER TABLE … ENABLE ROW LEVEL SECURITY` declarado?
- [ ] `ALTER TABLE … FORCE ROW LEVEL SECURITY` declarado?
- [ ] Schema da tabela é `public` (ou auditado se for outro)?

### Policies (8 itens)

- [ ] Policy SELECT existe e usa `USING (company_id = public.get_current_company_id())`?
- [ ] Policy INSERT existe e usa `WITH CHECK (company_id = public.get_current_company_id())`?
- [ ] Policy UPDATE existe e tem **ambos** `USING` e `WITH CHECK`?
- [ ] Policy DELETE existe e usa `USING (company_id = public.get_current_company_id())`?
- [ ] Nenhuma policy usa `USING (true)` ou `WITH CHECK (true)`?
- [ ] Policies têm `TO authenticated` (não `TO public`)?
- [ ] Para tabelas só-leitura por usuário, há policy de role específica (`TO service_role`)?
- [ ] Nome das policies é descritivo (`<table>_select_own_tenant`, não `policy1`)?

### Função resolver (4 itens)

- [ ] `get_current_company_id()` existe e é `STABLE SECURITY DEFINER`?
- [ ] `SET search_path = public` no resolver?
- [ ] Tem fallback para usuário sem perfil (placeholder ou erro controlado)?
- [ ] Existe variante `_strict()` que lança 403 quando sem vínculo (para mutações críticas)?

## Os 12 anti-patterns 🚨

### #1 — `USING (true)`
```sql
-- ❌ NUNCA
CREATE POLICY "all_access" ON public.invoices
  FOR SELECT USING (true);
```
Equivale a desligar RLS. Se a intenção era pular RLS, use `service_role`.

### #2 — INSERT sem `WITH CHECK`
```sql
-- ❌
CREATE POLICY "insert_invoice" ON public.invoices
  FOR INSERT TO authenticated
  USING (company_id = public.get_current_company_id());
```
`USING` não roda em INSERT. O cliente pode inserir linha de **qualquer** `company_id`.

```sql
-- ✅
CREATE POLICY "invoices_insert_own_tenant" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());
```

### #3 — UPDATE só com `USING`
Permite mover linha entre tenants. Sempre `USING + WITH CHECK`.

### #4 — `SECURITY DEFINER` sem `search_path`
```sql
-- ❌ vulnerável a search_path hijack
CREATE FUNCTION public.get_current_company_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER
AS $$ SELECT company_id FROM profiles WHERE id = auth.uid(); $$;
```
Atacante cria schema com função `auth.uid()` maliciosa e altera `search_path` na sessão.

```sql
-- ✅
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE id = auth.uid()),
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;
```

### #5 — Resolver `VOLATILE`
Sem `STABLE`, o planner re-executa a função para cada linha. Em tabela com 100k linhas, RLS fica 100x mais lento. Sempre `STABLE` (ou `IMMUTABLE` se nunca mudar).

### #6 — RLS sem `FORCE`
`ROW LEVEL SECURITY` sozinho **não afeta o dono da tabela**. Em Supabase, qualquer função `SECURITY DEFINER` mal escrita pode rodar como dono e ler tudo.

```sql
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
```

### #7 — View sem `security_invoker`
PostgreSQL 15+. Views por padrão rodam com permissões de quem **criou** a view, não de quem consulta. Em tabelas RLS, isso vaza dados.

```sql
-- ✅
CREATE VIEW public.invoices_summary
WITH (security_invoker = on)  -- crítico
AS SELECT … FROM public.invoices;
```

### #8 — Comparação fora do resolver
```sql
-- ❌ não usa o resolver canônico
USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
```
Cada policy reimplementa a lógica. Bug em uma não propaga fix para todas. Sempre via `public.get_current_company_id()`.

### #9 — Trigger `force_company_id` permissivo demais
```sql
-- ❌ se auth.uid() é NULL, NEW.company_id passa intacto do cliente
IF auth.uid() IS NOT NULL THEN
  NEW.company_id := get_current_company_id();
END IF;
```
Em chamadas de `service_role` ou Edge Function autenticada por outra forma, isso vira bypass. Garanta que o ELSE também tenha defesa (ou seja, nega).

### #10 — Tabela sem índice em `company_id`
RLS vira full table scan + filter. Para tabelas grandes:
```sql
CREATE INDEX idx_invoices_company_id ON public.invoices (company_id);
-- ou composto se houver outro filtro comum:
CREATE INDEX idx_invoices_company_status ON public.invoices (company_id, status);
```

### #11 — `service_role` no frontend
A chave `service_role` ignora RLS. Se o `.env` do cliente (`VITE_*` ou similar) tem ela, **qualquer usuário pode dropar o banco**. Sempre `anon` no cliente, `service_role` só em servidor (Edge Function, backend).

### #12 — Policy sem role específico (`TO public`)
```sql
-- ❌ aplica até para anônimos não autenticados
CREATE POLICY … FOR SELECT USING (…);
```
Sempre `TO authenticated`. Para casos especiais, `TO service_role` ou roles custom.

## Padrão de policy correta (template)

```sql
-- 1. Habilita RLS forçado
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

-- 2. SELECT
CREATE POLICY "invoices_select_own_tenant"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (company_id = public.get_current_company_id());

-- 3. INSERT
CREATE POLICY "invoices_insert_own_tenant"
  ON public.invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

-- 4. UPDATE (ambas as cláusulas)
CREATE POLICY "invoices_update_own_tenant"
  ON public.invoices
  FOR UPDATE
  TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

-- 5. DELETE
CREATE POLICY "invoices_delete_own_tenant"
  ON public.invoices
  FOR DELETE
  TO authenticated
  USING (company_id = public.get_current_company_id());

-- 6. Trigger force_company_id
CREATE OR REPLACE FUNCTION public.invoices_force_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.company_id := public.get_current_company_id_strict();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.company_id := OLD.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_force_company_id
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_force_company_id();

-- 7. Índice obrigatório para performance do RLS
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices (company_id);
```

## Como rodar EXPLAIN ANALYZE em policy suspeita

```sql
SET role authenticated;
SET request.jwt.claims = '{"sub":"<uuid-de-um-usuario-real>"}';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.invoices LIMIT 10;
RESET role;
```

Procure por: `Filter: (company_id = ...)` com `Rows Removed by Filter` alto = RLS funcionando mas índice ausente.
