# Supabase Migrator — Templates

6 templates prontos. Substitua `<placeholders>` e ajuste colunas.

## Template 1: CRUD Table (multi-tenant padrão)

```sql
-- ============================================================
-- Tabela: public.<NOME>
-- Descrição: <O QUE É>
-- ============================================================

CREATE TABLE IF NOT EXISTS public.<NOME> (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- ✏️ Domínio
  <NOME_CAMPO> text NOT NULL,
  -- adicione mais aqui

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.<NOME>             IS '<DESCRIÇÃO PT-BR>';
COMMENT ON COLUMN public.<NOME>.company_id  IS 'Tenant proprietário (FK companies.id)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_<NOME>_company_id ON public.<NOME> (company_id);
-- adicione índices por queries comuns (status, datas, FKs, etc.)

-- RLS
ALTER TABLE public.<NOME> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<NOME> FORCE  ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "<NOME>_select_own_tenant" ON public.<NOME>
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE POLICY "<NOME>_insert_own_tenant" ON public.<NOME>
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "<NOME>_update_own_tenant" ON public.<NOME>
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "<NOME>_delete_own_tenant" ON public.<NOME>
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id());

-- Trigger force_company_id
CREATE OR REPLACE FUNCTION public.<NOME>_force_company_id()
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

CREATE TRIGGER <NOME>_force_company_id
  BEFORE INSERT OR UPDATE ON public.<NOME>
  FOR EACH ROW EXECUTE FUNCTION public.<NOME>_force_company_id();

-- Trigger updated_at (assume set_updated_at() existe)
CREATE TRIGGER <NOME>_set_updated_at
  BEFORE UPDATE ON public.<NOME>
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<NOME> TO authenticated;

-- Realtime (opcional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.<NOME>;
```

## Template 2: Junction Table (N-N)

```sql
-- Junction entre <A> e <B>, com tenant
CREATE TABLE IF NOT EXISTS public.<A>_<B> (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  <A>_id      uuid NOT NULL REFERENCES public.<A>(id) ON DELETE CASCADE,
  <B>_id      uuid NOT NULL REFERENCES public.<B>(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, <A>_id, <B>_id)
);

COMMENT ON TABLE public.<A>_<B> IS 'Relação N-N entre <A> e <B> (tenant-scoped)';

CREATE INDEX IF NOT EXISTS idx_<A>_<B>_<A>_id ON public.<A>_<B> (<A>_id);
CREATE INDEX IF NOT EXISTS idx_<A>_<B>_<B>_id ON public.<A>_<B> (<B>_id);

ALTER TABLE public.<A>_<B> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<A>_<B> FORCE  ROW LEVEL SECURITY;

CREATE POLICY "<A>_<B>_all_own_tenant" ON public.<A>_<B>
  FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

-- Trigger force_company_id (mesmo padrão)
CREATE OR REPLACE FUNCTION public.<A>_<B>_force_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.company_id := public.get_current_company_id_strict();
    END IF;
    -- UPDATE em PK não comum, mas se ocorrer não muda tenant
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER <A>_<B>_force_company_id
  BEFORE INSERT ON public.<A>_<B>
  FOR EACH ROW EXECUTE FUNCTION public.<A>_<B>_force_company_id();

GRANT SELECT, INSERT, DELETE ON public.<A>_<B> TO authenticated;
```

## Template 3: Audit Log (append-only)

```sql
CREATE TABLE IF NOT EXISTS public.<ENTIDADE>_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  <entidade>_id uuid REFERENCES public.<ENTIDADE>(id) ON DELETE SET NULL,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('insert','update','delete')),
  before       jsonb,
  after        jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.<ENTIDADE>_audit IS 'Log append-only de mudanças em <ENTIDADE>';

CREATE INDEX IF NOT EXISTS idx_<ENTIDADE>_audit_company_id ON public.<ENTIDADE>_audit (company_id);
CREATE INDEX IF NOT EXISTS idx_<ENTIDADE>_audit_<entidade>_id ON public.<ENTIDADE>_audit (<entidade>_id);
CREATE INDEX IF NOT EXISTS idx_<ENTIDADE>_audit_created_at ON public.<ENTIDADE>_audit (created_at DESC);

ALTER TABLE public.<ENTIDADE>_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<ENTIDADE>_audit FORCE  ROW LEVEL SECURITY;

-- Append-only — só SELECT para users; INSERT só via trigger
CREATE POLICY "<ENTIDADE>_audit_select_own_tenant" ON public.<ENTIDADE>_audit
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

-- Sem policy INSERT/UPDATE/DELETE para authenticated → nem cliente, nem service_role nessa role
-- Trigger roda como SECURITY DEFINER (dono da função pode INSERT)

CREATE OR REPLACE FUNCTION public.<ENTIDADE>_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  INSERT INTO public.<ENTIDADE>_audit (company_id, <entidade>_id, actor_id, action, before, after)
  VALUES (
    v_company_id,
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    LOWER(TG_OP),
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER <ENTIDADE>_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.<ENTIDADE>
  FOR EACH ROW EXECUTE FUNCTION public.<ENTIDADE>_audit_log();

GRANT SELECT ON public.<ENTIDADE>_audit TO authenticated;
```

## Template 4: Soft Delete

Adicione coluna `deleted_at` e ajuste policies para filtrar.

```sql
ALTER TABLE public.<NOME> ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_<NOME>_not_deleted ON public.<NOME> (company_id) WHERE deleted_at IS NULL;

-- Substitua a policy SELECT padrão:
DROP POLICY IF EXISTS "<NOME>_select_own_tenant" ON public.<NOME>;
CREATE POLICY "<NOME>_select_own_tenant_active" ON public.<NOME>
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND deleted_at IS NULL
  );

-- Policy admin pra ver deletados (se aplicável):
CREATE POLICY "<NOME>_select_own_tenant_admin_deleted" ON public.<NOME>
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.is_admin()  -- assume função existe
  );

-- Função soft delete (RPC):
CREATE OR REPLACE FUNCTION public.soft_delete_<NOME>(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.<NOME>
  SET deleted_at = now()
  WHERE id = p_id
    AND company_id = public.get_current_company_id();
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_<NOME>(uuid) TO authenticated;
```

## Template 5: Materialized View (com refresh trigger-aware)

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.<NOME>_summary AS
SELECT
  company_id,
  date_trunc('day', created_at)::date AS day,
  count(*)                            AS total,
  sum(<numeric_col>)                  AS total_value
FROM public.<NOME>
WHERE deleted_at IS NULL  -- se aplicável
GROUP BY company_id, date_trunc('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_<NOME>_summary_pk
  ON public.<NOME>_summary (company_id, day);

-- Materialized views NÃO suportam RLS direto. Acesso só via função wrapper:
CREATE OR REPLACE FUNCTION public.get_<NOME>_summary(p_from date, p_to date)
RETURNS TABLE (day date, total bigint, total_value numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT day, total, total_value
  FROM public.<NOME>_summary
  WHERE company_id = public.get_current_company_id()
    AND day BETWEEN p_from AND p_to
  ORDER BY day;
$$;

GRANT EXECUTE ON FUNCTION public.get_<NOME>_summary(date, date) TO authenticated;

-- Refresh job (cron via pg_cron ou Edge Function):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY public.<NOME>_summary;
```

⚠️ Não use `GRANT SELECT ON public.<NOME>_summary TO authenticated` — isso bypassa RLS. Use só a função.

## Template 6: Function (RPC ou Trigger)

### RPC (chamável do cliente via `supabase.rpc()`)

```sql
CREATE OR REPLACE FUNCTION public.<NOME>(p_arg1 text, p_arg2 int)
RETURNS TABLE (id uuid, output text)
LANGUAGE plpgsql STABLE SECURITY INVOKER  -- INVOKER respeita RLS do caller
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.<col>::text
  FROM public.<TABELA> t
  WHERE t.company_id = public.get_current_company_id()  -- defesa adicional
    AND t.<col> = p_arg1;
END;
$$;

COMMENT ON FUNCTION public.<NOME>(text, int) IS '<O QUE FAZ>';
GRANT EXECUTE ON FUNCTION public.<NOME>(text, int) TO authenticated;
```

### Function que precisa de privilégio (`SECURITY DEFINER`)

```sql
CREATE OR REPLACE FUNCTION public.<NOME>(p_arg uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_current_company_id_strict();  -- 403 se não logado
BEGIN
  -- toda query deve filtrar por v_company manualmente
  -- (RLS não roda como o user em SECURITY DEFINER)
  UPDATE public.<TABELA>
  SET <col> = ...
  WHERE id = p_arg
    AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.<NOME>(uuid) TO authenticated;
```
