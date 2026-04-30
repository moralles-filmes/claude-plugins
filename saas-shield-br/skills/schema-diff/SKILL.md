---
name: schema-diff
description: Detecta drift entre migrations locais e schema remoto Supabase — tabelas em produção sem migration correspondente, tabelas órfãs sem RLS, sem trigger force_company_id, sem índice em company_id, sem FORCE RLS, ou policies divergentes. Use quando o usuário pedir "tem drift?", "o que mudou no banco?", "migration faltando?", "schema diff", "comparar local com remoto", "drift detection", ou antes de rodar `supabase db push`.
---

# schema-diff

Você compara o schema **declarado em migrations locais** vs o **schema real no Supabase remoto** e identifica drift acionável. Drift em multi-tenant é especialmente perigoso: uma tabela criada manualmente no Studio pode estar **sem RLS**.

## Quando ativa

- "Tem drift entre local e prod?"
- "Qual a diferença entre meu local e remoto?"
- "schema diff"
- Antes de `supabase db push` em projeto antigo
- Após herdar projeto sem histórico claro de migrations

## Fluxo

### Passo 1 — Pegar schema remoto

Peça ao usuário rodar:
```bash
supabase db dump --schema-only -f schema-remote.sql
# ou
supabase db dump --schema public --schema-only --data-only=false -f schema-remote.sql
```

E confirme que ele tem `supabase/migrations/*.sql` localmente.

### Passo 2 — Inventário comparativo

Para cada tabela em `schema-remote.sql`, verifique se há migration que a cria localmente:

```
Para cada CREATE TABLE em schema-remote.sql:
  - Existe migration em supabase/migrations/ que cria essa tabela?
  - Se NÃO → tabela criada manualmente (Studio?) — 🚨 sem migration
  - Se SIM → comparar definição
```

### Passo 3 — Para cada tabela com `company_id` no remoto, validar

- [ ] Tem RLS habilitado? (`pg_tables.rowsecurity = true`)
- [ ] Tem `FORCE RLS`? (`pg_class.relforcerowsecurity = true`)
- [ ] Tem trigger `*_force_company_id`?
- [ ] Tem policies SELECT/INSERT/UPDATE/DELETE?
- [ ] Tem índice em `company_id`?

Para cada item ausente → bloqueante.

### Passo 4 — Comparar policies

Liste policies remotas vs locais. Diferenças comuns:
- Policy local tem `WITH CHECK`, remota não (alguém editou no Studio)
- Policy remota usa `auth.uid()` direto, local usa `get_current_company_id()`
- Policy remota tem `USING (true)` (alguém debugando esqueceu)

### Passo 5 — Comparar funções `SECURITY DEFINER`

Especialmente `get_current_company_id`. Se a remota difere da local — pergunte qual é a fonte da verdade. Geralmente é a local (migrations).

## Saída

```
🔄 SCHEMA DIFF — <projeto>
Comparando: supabase/migrations/ vs schema-remote.sql

═══════════════════════════════════════════
🟢 SINCRONIZADO (<N> tabelas)
  - profiles, companies, plans, …

═══════════════════════════════════════════
🚨 BLOQUEANTES (<N>)

  1. public.legacy_clients
     └ Existe no remoto, sem migration local
     └ rowsecurity=false, sem FORCE, sem trigger
     🔧 Fix: criar migration que define essa tabela ou DROP no remoto

  2. public.invoices
     └ Migration local: policy "invoices_update_own_tenant" tem USING + WITH CHECK
     └ Remoto: policy "invoices_update_own_tenant" só tem USING
     🔧 Fix: rodar `supabase db push` para reaplicar policy local
        ou alguém editou no Studio — confirmar qual é a verdade

  3. public.subscriptions
     └ Existe no remoto, sem trigger force_company_id
     🔧 Fix: criar migration adicionando trigger

═══════════════════════════════════════════
🟡 ATENÇÃO (<N>)

  - Função get_current_company_id no remoto é VOLATILE (local é STABLE)
    → impacto em performance — rodar `supabase db push`

═══════════════════════════════════════════
📋 RECOMENDAÇÕES

  1. Aplicar migrations locais primeiro:
     supabase db push

  2. Para tabelas remotas órfãs (sem migration local):
     - Decida: era pra existir? Se sim, gere migration retroativa (use supabase-migrator)
     - Se não, drop com migration de cleanup

  3. Configure CI para diffar a cada PR:
     supabase db diff --schema public > /tmp/diff.sql
     test -s /tmp/diff.sql && echo "drift detectado" && exit 1
```

## Drift comum em projetos sem disciplina

| Padrão | Frequência | Causa |
|---|---|---|
| Tabela só no remoto, sem migration | Alta | Criada via Studio para "teste rápido" |
| Policy modificada manualmente | Média | Debug em prod, esquecido |
| Coluna adicional no remoto | Média | `ALTER TABLE … ADD COLUMN` no Studio |
| Função `SECURITY DEFINER` divergente | Baixa | Hotfix manual |
| RLS desabilitado em tabela | Baixa mas catastrófico | Debug deixou rastros |

## Princípios

- **Migrations são a fonte da verdade.** O remoto deve refletir migrations. Se diverge, ou aplicar local OU criar migration retroativa.
- **Nunca `DROP` automaticamente.** Diff sugere, humano decide.
- **Schema diff é parte do `/pre-deploy`.** Drift detectado = bloqueia deploy.

## Comandos úteis

```bash
# Diff bruto (Supabase CLI)
supabase db diff --schema public

# Diff entre dois ambientes
supabase db diff --linked --schema public > drift.sql

# Listar migrations já aplicadas remotamente
supabase migration list --linked

# Listar migrations locais
ls supabase/migrations/
```
