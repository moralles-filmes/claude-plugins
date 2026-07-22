---
name: supabase-migrator
description: Gera migrations Supabase (PostgreSQL) seguras por padrão, no arquétipo de tenant DO PROJETO (não assume company_id) — timestamp YYYYMMDDHHMMSS, idempotência, FORCE RLS, caminho de escrita conforme o profile, policies USING+WITH CHECK, índices na coluna de tenant, comentários PT-BR. Use quando o usuário pedir "criar migration", "nova migration para tabela X", "preciso de uma tabela Y", "supabase migrator", "gera SQL para [feature]". Resolve primeiro o tenancy-profile (skill tenant-model) e usa o template do arquétipo correto.
---

# supabase-migrator

Gerador de migrations PostgreSQL/Supabase multi-tenant. Toda migration é **segura por padrão** (RLS + FORCE RLS + caminho de escrita conforme o profile + policies `USING`+`WITH CHECK` + índices) — mas no **arquétipo do projeto**, não num `company_id` fixo.

## Passo 0 — Resolver a convenção (obrigatório)

Carregue a skill [tenant-model] e leia `.claude/tenancy-profile.yml` (ou detecte). Fixe:
- `TC` (coluna(s) de tenant), `R` (resolver), `WP` (write_path), `rls_helper_namespace`.
- O **arquétipo** (A `company_id`/JWT/force-trigger, B `unit_id`/membership, C `org+unit`/RBAC, D `unit_id`/set). Se greenfield sem profile, **pergunte** o arquétipo e crie o `tenancy-profile` junto.

Os templates completos por arquétipo estão em `reference.md` da skill [tenant-model]. Abaixo, o scaffold ilustrado no **Arquétipo A**; adapte os identificadores e o caminho de escrita ao arquétipo do projeto.

## Antes de gerar — pergunte (se não estiver no input)

1. **Nome da tabela** (snake_case plural).
2. **Colunas** além de `id`, `<TC>`, `created_at`, `updated_at`.
3. **Tipo/template** (`templates.md`): `crud-table` | `junction` | `audit-log` | `soft-delete` | `materialized-view` | `function`.
4. **Relacionamentos** (FKs) e **soft delete?** (default não).

## Cabeçalho + nome do arquivo

```sql
-- Migration: <descrição PT-BR>
-- Data: <YYYY-MM-DD>  | Arquétipo de tenant: <A|B|C|D>  | Revisado contra rls-reviewer: ✅
-- Mudanças: cria public.<nome> + FORCE RLS + policies + caminho de escrita (<WP>) + índice em <TC>
```
Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_<descricao_snake_case>.sql` (timestamp UTC — `date -u +"%Y%m%d%H%M%S"`).

## Scaffold (ilustrado no Arquétipo A — adapte ao profile)

```sql
-- 1. TABELA
CREATE TABLE IF NOT EXISTS public.<tabela> (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,  -- <TC> → tabela de tenant
  -- ... campos do domínio ...
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.<tabela> IS '<descrição PT-BR>';

-- 2. ÍNDICE em <TC> (RLS-aware)
CREATE INDEX IF NOT EXISTS idx_<tabela>_company_id ON public.<tabela> (company_id);

-- 3. RLS
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<tabela> FORCE  ROW LEVEL SECURITY;

-- 4. POLICIES (USING + WITH CHECK via resolver R)
CREATE POLICY "<tabela>_select_own_tenant" ON public.<tabela>
  FOR SELECT TO authenticated USING (company_id = public.get_current_company_id());
CREATE POLICY "<tabela>_insert_own_tenant" ON public.<tabela>
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_current_company_id());
CREATE POLICY "<tabela>_update_own_tenant" ON public.<tabela>
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());
CREATE POLICY "<tabela>_delete_own_tenant" ON public.<tabela>
  FOR DELETE TO authenticated USING (company_id = public.get_current_company_id());

-- 5. CAMINHO DE ESCRITA conforme <WP>
--    A (force-trigger): trigger deriva <TC> no INSERT e congela no UPDATE (abaixo)
--    B/D (server-scoped): SEM trigger; a escrita server-side informa <TC> e o WITH CHECK valida
--    C (rpc-security-definer): SEM policy de escrita p/ authenticated; mutação por RPC que valida o tenant
CREATE OR REPLACE FUNCTION public.<tabela>_force_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN NEW.company_id := public.get_current_company_id_strict();
    ELSIF TG_OP = 'UPDATE' THEN NEW.company_id := OLD.company_id; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER <tabela>_force_company_id
  BEFORE INSERT OR UPDATE ON public.<tabela>
  FOR EACH ROW EXECUTE FUNCTION public.<tabela>_force_company_id();

-- 6. updated_at + GRANTs
CREATE TRIGGER <tabela>_set_updated_at BEFORE UPDATE ON public.<tabela>
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabela> TO authenticated;
```

> **Nos arquétipos B/C/D não gere o trigger `force_company_id`.** Use o resolver do projeto (ex.: `unit_id in (select app.current_unit_ids())`, `is_unit_member(auth.uid(), unit_id)`, `has_permission(...)`) e o caminho de escrita declarado. Veja os templates completos em [tenant-model] `reference.md`.

## Princípios

1. **Idempotência sempre** (`IF NOT EXISTS`, `CREATE OR REPLACE`).
2. **Cascata explícita** na FK de tenant; `RESTRICT` onde o dado deve persistir.
3. **Sem seed na migration estrutural.**
4. **PT-BR nos comments.** **Naming**: policies `<tabela>_<cmd>_<contexto>`, índices `idx_<tabela>_<colunas>`.
5. **Sem `DROP` casual** — pergunte por dados/backup/reversibilidade.

## Saída esperada

1. O `.sql` completo. 2. Nome do arquivo (timestamp UTC). 3. Resumo (3 bullets) **com o arquétipo usado**. 4. Auto-validação contra o checklist parametrizado do [rls-reviewer]. 5. Próximos passos (salvar → `supabase db push` → conferir policies no Studio → testar que o cliente não escolhe o tenant).

## Anti-padrões a recusar

Tabela sensível sem `<TC>`; `USING (true)`; `SECURITY DEFINER` sem `search_path`; INSERT/UPDATE só com `USING`; sem FORCE RLS.

## Eficiência

- Base nos `templates.md`; `naming.md` só em dúvida; valide contra `rls-reviewer/reference.md` sem duplicar texto.
