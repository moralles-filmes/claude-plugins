---
name: multi-tenant-auditor
description: Auditoria profunda de isolamento multi-tenant em SaaS Supabase, parametrizada pelo modelo de tenant do projeto (não assume company_id). Use quando o usuário pedir "auditar isolamento", "audita esse SaaS", "vaza dados entre tenants?", "checar todas as tabelas", "audit multi-tenant". Diferente do `rls-reviewer` (um arquivo), esta skill varre o REPO INTEIRO: tabelas órfãs, JOINs perigosos, edge functions/route handlers/RPCs com service_role, views sem security_invoker, e clientes que enviam a coluna de tenant no payload. É a base de conhecimento do agente tenant-isolation-auditor.
---

# multi-tenant-auditor

Varredura completa de um repo multi-tenant Supabase para garantir que **nenhum dado vaza entre tenants**. Base de conhecimento do agente `tenant-isolation-auditor`.

## Passo 0 — Resolver a convenção (obrigatório)

Carregue a skill [tenant-model], leia `.claude/tenancy-profile.yml` (ou detecte). Fixe: `TC` (coluna(s) de tenant), `R` (resolver), `WP` (write_path), `secrets_boundary` (edge-function | route-handler | rpc), `client_env_prefix` (`VITE_`/`NEXT_PUBLIC_`). **Nunca hardcode `company_id`.**

## Método — 7 passos

Carregue `reference.md` (matriz de severidade + queries SQL de auditoria + padrões de edge function).

### 1 — Inventário de tabelas
`Grep` por `create table` nas migrations. Para cada tabela, veja se tem `<TC>`. Sem `<TC>`:
- Tabela **global** legítima (a própria tabela de tenant, `plans`, `feature_flags`, `platform_admins`, `audit log` cross-tenant) → OK, documente por quê.
- Tabela **órfã** (dado de usuário sem tenant) → bloqueante (P0/P1).

### 2 — Validar o resolver `R`
Procure a definição de `R`. Confirme `STABLE SECURITY DEFINER` + `SET search_path` + autoridade correta ao `resolver_kind` (JWT `app_metadata` / membership / set). Ausência ou `user_metadata` = bloqueante.

### 3 — Validar o caminho de escrita conforme `WP`
- `force-trigger`: cada tabela com `<TC>` tem trigger que deriva no servidor e congela no UPDATE. Sem trigger = bloqueante.
- `server-scoped`: confirme que não há policy de escrita permissiva e que o servidor filtra por `<TC>`; `WITH CHECK` amarra a `R`.
- `rpc-security-definer`: tabelas sensíveis sem policy de escrita; mutação por RPC que valida tenant. RPC sem validação = bloqueante.

### 4 — Policies (delegar a [rls-reviewer])
Rode o checklist parametrizado do rls-reviewer por tabela; resuma.

### 5 — JOINs perigosos e views
No código, procure `select('*, <relacao>(*)')` — a tabela relacionada precisa de RLS própria. Em SQL, toda `CREATE VIEW` sobre tabela RLS precisa de `WITH (security_invoker = on)` (PG15+). Sem isso = bloqueante.

### 6 — `service_role` / admin client fora de lugar
Conforme `secrets_boundary`, a fronteira privilegiada muda, mas a regra é a mesma — **`service_role` nunca no cliente** e **nunca confia em `<TC>` vindo do body**:
- `grep` por `service_role`/`SERVICE_ROLE_KEY` em `src/`, `app/`, `components/` → qualquer match no cliente é bloqueante.
- `grep` por `<client_env_prefix>...SERVICE` → segredo em env pública = bloqueante.
- Na fronteira (`supabase/functions/**` para edge-function; `app/api/**/route.ts` + Server Actions para route-handler; RPCs para rpc): se recebe `<TC>` do payload e usa `service_role` sem revalidar via JWT/fonte confiável = vazamento total.

### 7 — Payload com `<TC>` vindo do cliente
`grep` por `.insert({ <TC>: ... })`/`.update({ <TC>: ... })` no cliente. Se `WP` é `force-trigger`, o trigger sobrescreve (atenção, defesa em profundidade). Se `WP` é `server-scoped`/`rpc`, aceitar `<TC>` do cliente pode ser bypass real (P1) — verifique.

## Saída

Formato de [agent-result-contract] (Veredito + achados P0–P3 por vetor + controles aprovados + lacunas de cobertura + próxima ação). Registre o profile/arquétipo. Para cada bloqueante, dê o vetor de exploração concreto e o patch.

## Princípios

- **Ausência de evidência é evidência de risco.** Tabela sem o controle esperado num `grep` recursivo é vulnerável até prova em contrário — mas diga o que você pesquisou.
- **Defesa em profundidade**: RLS + caminho de escrita + validação de payload são camadas independentes; reporte as que faltam.
- **A fronteira privilegiada é o ponto cego.** A maioria dos vazamentos vem de código server-side com `service_role` que aceita o tenant no body sem reautenticar — seja Edge Function, Route Handler ou RPC.

## Eficiência

| Caçar | Padrão |
|---|---|
| Tabelas sem `<TC>` | `Grep("create table", glob="**/migrations/*.sql")` → validar cada |
| Caminho de escrita | `Grep("force_|security definer|create policy", glob="**/migrations/*.sql")` |
| service_role no cliente | `Grep("service_role", glob="{src,app,components}/**/*.{ts,tsx,js,jsx}")` |
| Payload com `<TC>` | `Grep("<TC>\\s*:", glob="{src,app}/**/*.{ts,tsx}")` |
| Views sem invoker | `Grep("create view", glob="**/migrations/*.sql")` cruzar com `security_invoker` |
