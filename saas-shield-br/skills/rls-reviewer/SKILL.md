---
name: rls-reviewer
description: Audita políticas Row-Level Security (RLS) do PostgreSQL/Supabase contra um checklist parametrizado pelo modelo de tenant do projeto (não assume company_id). Use quando o usuário pedir "revise essas policies", "audita esse RLS", "isso aqui tá seguro?", "review RLS", ou ao analisar migrations *.sql com `CREATE POLICY`, `ENABLE/FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER`. Resolve primeiro a convenção de tenancy (skill tenant-model) e valida contra os invariantes universais + o arquétipo do projeto.
---

# rls-reviewer

Auditor de RLS multi-tenant. **Não parte do princípio de que o tenant é `company_id`.** Resolve a convenção do projeto primeiro e audita contra ela.

## Quando esta skill ativa

- Arquivos `.sql` em `supabase/migrations/**` ou `db/migrations/**` que mexem em policies, RLS, `SECURITY DEFINER`, triggers/resolvers de tenant
- O usuário cola SQL com `CREATE POLICY`, `ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY`, ou `CREATE FUNCTION … SECURITY DEFINER`
- Variantes de "isso aqui tá seguro?" sobre RLS, ou "audita RLS"

## Passo 0 — Resolver a convenção (obrigatório)

Carregue a skill [tenant-model] e leia `.claude/tenancy-profile.yml` (ou detecte). Projeto com `docs/standards/` (Padrão SaaS): MULTI_TENANCY, ACCESS_CONTROL e DATABASE do projeto são a régua dos achados. Extraia:
- `archetype` (A–E; projeto novo do Padrão SaaS é E)
- `TC` = coluna(s) de tenant (`tenant.columns`) — ex.: `company_id`, `unit_id`, `organization_id`+`unit_id`
- `R` = resolver canônico (`tenant.resolver`) + `resolver_kind` (jwt-claim | membership-lookup | set)
- `WP` = caminho de escrita (`write_path`: force-trigger | server-scoped | rpc-security-definer)
- namespace dos helpers (`rls_helper_namespace`: `private` no E; `app`/`public` em projetos antigos)

Onde este documento escreve `TC`/`R`, use os valores do projeto. **Se não resolver `TC`/`R`, reporte `INCONCLUSIVE`** (ver [agent-result-contract]) — nunca invente `company_id`.

## Fluxo de trabalho

1. **Passo 0** acima. **Carregue `reference.md`** desta skill (checklist + 12 anti-patterns). Não trabalhe de memória.
2. **Identifique tabelas afetadas** (toda tabela em `CREATE POLICY`, `ALTER TABLE … RLS`, triggers, RPCs).
3. **Para cada tabela**, valide as 4 camadas parametrizadas:
   - **Camada 1 — Coluna**: `<TC>` `not null` (+ FK para a tabela de tenant), índice em `<TC>`.
   - **Camada 2 — Escrita** conforme `WP`: `force-trigger` → trigger BEFORE INSERT/UPDATE deriva `<TC>` do servidor e o congela no UPDATE; `server-scoped` → `WITH CHECK` via `R` barra tenant alheio, escrita direta do cliente só nas colunas com grant (no E), escrita com service role filtra `<TC>` explicitamente; `rpc-security-definer` → sem DML de cliente, mutação por RPC que valida o tenant. **Verifique o caminho declarado — não exija force-trigger se `WP` ≠ `force-trigger`.**
   - **Camada 3 — RLS**: `ENABLE` **e** `FORCE ROW LEVEL SECURITY`.
   - **Camada 4 — Policies**: SELECT/INSERT/UPDATE/DELETE com `USING`+`WITH CHECK` chamando `R` (nunca reimplementar o resolver inline).
4. **Para cada função `SECURITY DEFINER`**: `SET search_path = ''` com nomes qualificados (`= public` em projeto antigo é P2), `STABLE`/`IMMUTABLE` quando possível, `revoke execute … from public`, não retorna dados de outro tenant.
5. **Para cada FK entre tabelas do mesmo tenant**: chave composta `(<TC>, <fk>)` referenciando `unique (<TC>, id)`. Checagens de FK ignoram RLS; FK simples permite referência cruzada entre tenants.
6. **Grants**: `revoke all … from anon, authenticated` e grant só do necessário na mesma migration. Tabela que depende dos default privileges do Supabase é P2. Coluna de estado de transição crítica com grant de update para `authenticated` é P1 (a transição tem de passar por RPC/caso de uso).
7. **Rode os 12 anti-patterns** do `reference.md`. Cada match confirmado é bloqueante (P0/P1).
8. **Arquétipo E**: rode também as checagens adicionais do `reference.md` (helpers, `(select …)`, permissão `ver` do submódulo, `allowed_company_ids(…, true)` em cadastro compartilhado).

## Princípio fundamental

> **O cliente indica, o banco/servidor decide.** O cliente pode indicar o tenant (empresa ativa da URL, `company_id` no insert). Quem decide é a confirmação independente: `with check` chamando `R`, trigger que deriva o tenant, RPC que valida, ou `.eq(<TC>)` com tenant resolvido no servidor. Valor de `<TC>` vindo do cliente e usado **sem** essa confirmação é bypass.

Policy que reimplementa o resolver com subquery direta na tabela de membership (sem passar por `R`) é suspeita. Super admin é **autoridade separada** — a policy de super nunca depende de `user_metadata`.

### Portabilidade (arquétipo E)

Em projeto cujo `tenancy-profile` declara `archetype: E`, `auth.uid()` direto em policy ou helper (fora do adapter `00_identidade_supabase.sql`) é achado de **portabilidade, P3**, não bloqueante: troque por `(select private.current_user_id())` (GCP_MIGRATION §2). Idem FK de usuário para `auth.users` em vez de `public.app_users`. Nos arquétipos A–D, `auth.uid()` é a convenção existente e não é achado.

## Violações que você NUNCA deixa passar (universais)

1. Tabela sensível sem `FORCE ROW LEVEL SECURITY`.
2. `USING (true)` em tabela tenant-scoped.
3. INSERT/UPDATE só com `USING`, sem `WITH CHECK`.
4. `SECURITY DEFINER` sem `SET search_path` (CVE-grade).
5. Resolver `VOLATILE` que podia ser `STABLE`.
6. View sobre tabela RLS sem `WITH (security_invoker = on)` (PG15+).
7. `service_role` referenciado em código frontend / segredo em env pública.
8. Caminho de escrita que aceita `<TC>` do cliente sem confirmação (insert/update sem `with check` via `R`, trigger com `auth.uid() IS NULL` passando o valor, RPC sem validar tenant, `.eq` server ausente).
9. Policy que compara `<TC>` com algo que não vem de `R`.
10. Tabela sem índice em `<TC>`.
11. FK nova entre tabelas do mesmo tenant sem chave composta com `<TC>` (P1; em tabela existente, P2 com plano de migração).

## Saída

Formato de [agent-result-contract] (Veredito PASS/PASS_WITH_WARNINGS/FAIL/INCONCLUSIVE + achados P0–P3 + lacunas de cobertura + próxima ação). Se houver bloqueante, encerre com: **"Não aplique essa migration. Corrija os bloqueantes."** Registre qual profile/arquétipo foi usado.

## Eficiência de tokens

- `Grep` por `CREATE POLICY|FORCE|SECURITY DEFINER|<resolver>` antes de Read full.
- Não cole o SQL inteiro — cite linhas.
- `reference.md` (~200 linhas): carregue uma vez.