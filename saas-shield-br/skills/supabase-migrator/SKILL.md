---
name: supabase-migrator
description: Gerador único de migrations Supabase/Postgres dos plugins do marketplace (o /new-migration e os agentes do saas-builder-br usam esta skill; não há outro template). Gera no arquétipo do projeto, com o arquétipo E do Padrão SaaS v3.2 como padrão — helpers private.*, (select private.current_user_id()), search_path = '', enable + force RLS, policies por operação to authenticated, grants explícitos, FK composta com a coluna de tenant e transição crítica só por RPC. Use quando o usuário pedir "criar migration", "nova tabela", "preciso de uma tabela X", "gera o SQL de [feature]", "supabase migrator". Se o projeto tem docs/standards/, as normas do projeto (DATABASE, MULTI_TENANCY, ACCESS_CONTROL) prevalecem.
---

# supabase-migrator

Fonte única de geração de migration. O `/new-migration` usa esta skill, e os agentes do saas-builder-br (`db-schema-designer`, `backend-supabase`) a referenciam em vez de manter template próprio. Template de migration em outro lugar que contradiz este é dívida: vale este (e, acima dele, as normas do projeto).

## Passo 0 — Normas e convenção (obrigatório)

1. **Projeto com `docs/standards/`** (Padrão SaaS): leia `DATABASE.md`, `MULTI_TENANCY.md` e `ACCESS_CONTROL.md` do projeto. **Elas prevalecem** sobre esta skill quando divergirem, inclusive nas "Particularidades deste projeto". Leia também `supabase/AGENTS.md`, se existir.
2. Carregue a skill [tenant-model] e leia `.claude/tenancy-profile.yml`. Fixe `archetype`, coluna de tenant (`TC`), filial (`locations`), helpers e `write_path`.
3. **Sem profile em projeto novo**: proponha o arquétipo E, confirme com o usuário e crie o profile junto (modelo em `padrao-saas:aplicar`).
4. **Projeto legado (A–D)**: gere no arquétipo declarado (notas no fim de `templates.md`). Não migre de arquétipo como efeito colateral (MULTI_TENANCY §1).

## Antes de gerar — pergunte o que faltar

1. Tabela (snake_case, plural) e **módulo/submódulo** dono dela. As permissões seguem `<modulo>.<submodulo>.<acao>`.
2. Dado da **empresa** (cadastro compartilhado) ou da **filial** (operação: pedido, caixa, conta)?
3. Colunas, FKs (quais apontam para tabela do mesmo tenant → FK composta) e checks.
4. Há **coluna de estado** com transição crítica (baixar, aprovar, cancelar, estornar)? Ela vira RPC e sai do grant de update.
5. As chaves de permissão já existem no catálogo (`public.permissions`)? Se não, a migration insere.

## Regras do arquétipo E (padrão)

Templates completos em `templates.md`. O que toda migration gerada cumpre:

- **Usuário**: `(select private.current_user_id())`, nunca `auth.uid()` direto. FK de usuário aponta para `public.app_users`, nunca `auth.users`. Só o adapter de identidade conhece o `auth` (GCP_MIGRATION §2).
- **RLS**: `enable` **e** `force row level security` na mesma migration da tabela.
- **Policies**: uma por operação, `to authenticated`, helpers dentro de `(select …)`:
  - tabela da empresa: `company_id in (select private.allowed_company_ids('<modulo>.<sub>.<acao>'))`; alteração de cadastro compartilhado usa `allowed_company_ids('…', true)`;
  - tabela da filial: `location_id in (select private.allowed_location_ids('<modulo>.<sub>.<acao>'))`;
  - leitura usa a ação `ver` do submódulo dono da tabela; insert e update têm `with check`.
- **Grants explícitos**: `revoke all … from anon, authenticated` e grant só do necessário (por coluna quando há coluna de estado). Não dependa dos default privileges do Supabase.
- **FK composta** `(company_id, x)` → `unique (company_id, id)` na tabela referenciada; filial por `(company_id, location_id)` → `locations (company_id, id)`. Checagem de FK ignora RLS.
- **Transição crítica** só por RPC (`security definer`, `set search_path = ''`, confere a ação no próprio `where`) ou por caso de uso no servidor (modelo A de DATABASE §4). O cliente não tem grant de update na coluna de estado.
- **Funções**: `set search_path = ''`, nomes qualificados, `revoke … from public, anon` e grant explícito a quem chama.
- **Views**: `with (security_invoker = true)`.
- **Índices** nas colunas usadas pelas policies (`company_id`, `location_id`).
- **Forward-only**: nunca edite migration já aplicada em ambiente compartilhado; crie outra. Mudança incompatível segue expand → backfill → contract.

> **FORCE e BYPASSRLS.** Os helpers `security definer` e as RPCs leem tabelas com FORCE. Isso só funciona se o dono das funções tiver `BYPASSRLS` (no Supabase, `postgres` tem). Confira com `select rolname, rolbypassrls from pg_roles where rolname = current_user;` antes de forçar nas tabelas de membership e permissões. Sem isso, as policies entram em recursão (DATABASE §5).

## Arquivo

Crie com `supabase migration new <descricao_snake_case>` (gera `supabase/migrations/<YYYYMMDDHHMMSS>_<descricao>.sql`, timestamp UTC) e cole o SQL. Cabeçalho:

```sql
-- Migration: <descrição PT-BR>
-- Arquétipo: E | Módulo: <modulo> | Normas: docs/standards/DATABASE.md, MULTI_TENANCY.md, ACCESS_CONTROL.md
```

`naming.md` tem as convenções de nome. O hook `check-sql-antipattern.mjs` deste plugin bloqueia tabela sem RLS/FORCE, `using (true)` e `security definer` sem `search_path` ao salvar.

## Saída esperada

1. SQL completo e nome do arquivo.
2. Resumo em 3 bullets: arquétipo, permissões usadas, o que o cliente pode e não pode gravar.
3. Autovalidação contra o checklist do [rls-reviewer].
4. Teste pgTAP dos cenários de ACCESS_CONTROL §10 que a tabela toca (ao menos: outra empresa negado, sem permissão negado, com permissão permitido, outra filial negado, transição por update direto negado).
5. Próximos passos, **sempre locais**:

```bash
supabase migration new <descricao>     # cria o arquivo; cole o SQL
supabase db reset                      # aplica TODAS as migrations no banco LOCAL (Docker)
supabase test db                       # pgTAP, incluindo os testes de isolamento
supabase db lint                       # lint do schema local; veja também os Advisors no Studio local
# /check-rls <arquivo> e o agente migration-validator antes do PR
```

Remoto: `supabase db push` aplica no projeto **linkado** (staging/produção). Só depois do merge, pelo pipeline ou com **autorização explícita** do usuário, conferindo antes com `supabase db push --dry-run`. Nunca use `db push` para "testar".

## Anti-padrões a recusar

Tabela de tenant sem RLS/FORCE; `using (true)`; insert/update sem `with check`; `security definer` sem `set search_path = ''`; `auth.uid()` direto em projeto E; FK de usuário para `auth.users`; FK simples entre tabelas do mesmo tenant; grant amplo herdado de default privileges; coluna de estado com grant de update; `drop` sem plano, backup e autorização.
