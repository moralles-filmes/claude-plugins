---
name: multi-tenant-auditor
description: 'Base de conhecimento (método em 7 passos) de auditoria de isolamento multi-tenant em SaaS Supabase, parametrizada pelo modelo de tenant do projeto (não assume company_id). Diferente do `rls-reviewer` (um arquivo), cobre o REPO INTEIRO: tabelas órfãs, JOINs perigosos, edge functions/route handlers/RPCs com service_role, views sem security_invoker, e tenant indicado pelo cliente sem confirmação de membership. Pré-carregada via `skills:` pelo agente `tenant-isolation-auditor` — pedidos do usuário como "audita esse SaaS" ou "vaza dados entre tenants?" devem ir para esse agente (ou `/audit-tenant`), não para esta skill diretamente.'
---

# multi-tenant-auditor

Varredura completa de um repo multi-tenant Supabase para garantir que **nenhum dado vaza entre tenants**. Base de conhecimento do agente `tenant-isolation-auditor`.

## Passo 0 — Resolver a convenção (obrigatório)

Carregue a skill [tenant-model], leia `.claude/tenancy-profile.yml` (ou detecte). Fixe: `archetype`, `TC` (coluna(s) de tenant), `R` (resolver), `WP` (write_path), `active_source` (url | jwt-claim | session), `secrets_boundary` (edge-function | route-handler | rpc), `client_env_prefix` (`VITE_`/`NEXT_PUBLIC_`). **Nunca hardcode `company_id`.** Projeto com `docs/standards/`: MULTI_TENANCY e ACCESS_CONTROL do projeto são a régua.

## Método — 7 passos

Carregue `reference.md` (matriz de severidade + queries SQL de auditoria + padrões de edge function).

### 1 — Inventário de tabelas
`Grep` por `create table` nas migrations. Para cada tabela, veja se tem `<TC>`. Sem `<TC>`:
- Tabela **global** legítima (a própria tabela de tenant, `plans`, `feature_flags`, `platform_admins`, `audit log` cross-tenant) → OK, documente por quê.
- Tabela **órfã** (dado de usuário sem tenant) → bloqueante (P0/P1).

### 2 — Validar o resolver `R`
Procure a definição de `R`. Confirme `STABLE SECURITY DEFINER` + `SET search_path = ''` + autoridade correta ao `resolver_kind` (membership/set no E; JWT `app_metadata` só no A). Ausência ou `user_metadata` = bloqueante. No E, a empresa ativa vem da URL e é confirmada pela membership a cada requisição: empresa ativa lida de claim do JWT (`app_metadata.company_id`) num projeto `active_source: url` é P1 (claim fica velha até o refresh; MULTI_TENANCY §2).

### 3 — Validar o caminho de escrita conforme `WP`
- `force-trigger`: cada tabela com `<TC>` tem trigger que deriva no servidor e congela no UPDATE. Sem trigger = bloqueante.
- `server-scoped`: confirme que não há policy de escrita permissiva e que o servidor filtra por `<TC>`; `WITH CHECK` amarra a `R`.
- `rpc-security-definer`: tabelas sensíveis sem policy de escrita; mutação por RPC que valida tenant. RPC sem validação = bloqueante.

### 4 — Policies (delegar a [rls-reviewer])
Rode o checklist parametrizado do rls-reviewer por tabela; resuma.

### 5 — JOINs perigosos e views
No código, procure `select('*, <relacao>(*)')` — a tabela relacionada precisa de RLS própria. Em SQL, toda `CREATE VIEW` sobre tabela RLS precisa de `WITH (security_invoker = on)` (PG15+). Sem isso = bloqueante.

### 6 — `service_role` / admin client fora de lugar
Conforme `secrets_boundary`, a fronteira privilegiada muda, mas a regra é a mesma — **`service_role` nunca no cliente** e **o tenant indicado pelo cliente nunca é aceito sem confirmação**:
- `grep` por `service_role`/`SERVICE_ROLE_KEY`/`sb_secret_` em `src/`, `app/`, `components/` → qualquer match no cliente é bloqueante.
- `grep` por `<client_env_prefix>...SERVICE` → segredo em env pública = bloqueante.
- Na fronteira (`supabase/functions/**` para edge-function; `app/api/**/route.ts` + Server Actions para route-handler; RPCs para rpc): o cliente pode **indicar** a empresa ativa (header `x-company-id`, slug da URL). O servidor confirma a membership ativa e a permissão antes de usar, e ignora/sobrescreve `<TC>` vindo no body. Usar `<TC>` do payload/header com `service_role` sem essa confirmação = vazamento total (P0). Com `service_role`, toda query filtra `<TC>` explicitamente.

### 7 — Payload com `<TC>` vindo do cliente
`grep` por `.insert({ <TC>: ... })`/`.update({ <TC>: ... })` no cliente. Classifique pela confirmação que existe do outro lado:
- **E (e B/D)**: o cliente indica `<TC>` no insert e a policy `with check` com `R` confirma. É o desenho, não achado — desde que a policy exista e a coluna de tenant não esteja no grant de update. Sem `with check` = P1.
- **A (`force-trigger`)**: o trigger sobrescreve; registre como atenção (defesa em profundidade).
- **`rpc-security-definer`** ou escrita server-side com `service_role`: `<TC>` do cliente só vale depois de confirmar membership/permissão. Sem isso = P1/P0.

## Saída

Formato de [agent-result-contract] (Veredito + achados P0–P3 por vetor + controles aprovados + lacunas de cobertura + próxima ação). Registre o profile/arquétipo. Para cada bloqueante, dê o vetor de exploração concreto e o patch.

## Princípios

- **Ausência de evidência é evidência de risco.** Tabela sem o controle esperado num `grep` recursivo é vulnerável até prova em contrário — mas diga o que você pesquisou.
- **Defesa em profundidade**: RLS + caminho de escrita + validação de payload são camadas independentes; reporte as que faltam.
- **A fronteira privilegiada é o ponto cego.** A maioria dos vazamentos vem de código server-side com `service_role` que aceita o tenant indicado pelo cliente sem confirmar a membership — seja Edge Function, Route Handler ou RPC.
- **Portabilidade (E)**: `auth.uid()` direto em policy/helper fora do adapter de identidade é P3 (GCP_MIGRATION §2), não bloqueante.

## Eficiência

| Caçar | Padrão |
|---|---|
| Tabelas sem `<TC>` | `Grep("create table", glob="**/migrations/*.sql")` → validar cada |
| Caminho de escrita | `Grep("force_|security definer|create policy", glob="**/migrations/*.sql")` |
| service_role no cliente | `Grep("service_role", glob="{src,app,components}/**/*.{ts,tsx,js,jsx}")` |
| Payload com `<TC>` | `Grep("<TC>\\s*:", glob="{src,app}/**/*.{ts,tsx}")` |
| Views sem invoker | `Grep("create view", glob="**/migrations/*.sql")` cruzar com `security_invoker` |
