---
name: tenant-model
description: Fonte única da verdade sobre o modelo multi-tenant de um projeto. NÃO assume company_id — descreve o "tenancy-profile" (contrato configurável de tenancy), como lê-lo, como detectá-lo quando ausente, os invariantes universais que valem em qualquer arquétipo, e os 4 arquétipos de referência (company_id/JWT, unit/membership, org+unit/RBAC, unit/set). Pré-carregue em todo agente que audita ou gera RLS, migrations ou isolamento de tenant.
---

# tenant-model

Este plugin **não** tem um esquema de tenant único. Projetos reais divergem: alguns usam `company_id` com claim de JWT, outros `unit_id` com membership, outros `organization_id`+`unit_id` com RBAC. **Antes de auditar ou gerar qualquer coisa relacionada a tenant, resolva a convenção do projeto.** Nunca hardcode `company_id`.

## Passo 1 — Ler o `tenancy-profile`

Procure `.claude/tenancy-profile.yml` (ou `.json`/`.md`) na raiz do repo. Formato canônico:

```yaml
framework: next-app          # vite | next-app | next-pages | monorepo | expo | fastify
tenant:
  columns: [unit_id]         # ex.: [company_id] | [unit_id] | [organization_id, unit_id]
  resolver: current_unit_ids # nome da função canônica de resolução de tenant
  resolver_kind: set         # jwt-claim | membership-lookup | set
  force_trigger: false       # existe trigger *_force_<col> que deriva o tenant no servidor?
  write_path: server-scoped  # force-trigger | server-scoped | rpc-security-definer
membership:
  model: multi               # single | multi (usuário pertence a 1 ou N tenants)
  table: user_unit_roles
roles:
  model: numeric-levels      # numeric-levels | permission-strings | enum | rbac-tables
super_admin:
  authority: user_profiles.is_super_admin   # coluna/tabela que é a autoridade
  fn: is_super_admin
secrets_boundary: route-handler   # edge-function | route-handler | rpc
client_env_prefix: NEXT_PUBLIC_   # VITE_ | NEXT_PUBLIC_
rls_helper_namespace: app         # app | public (schema dos helpers de RLS)
display_term: Unidade             # rótulo de UI: Empresa | Organização | Unidade | Workspace | Clínica | Restaurante
```

Trate cada campo como um **parâmetro**: onde a regra antiga dizia `company_id`, use `tenant.columns`; onde dizia `get_current_company_id()`, use `tenant.resolver`; etc.

## Passo 2 — Se o profile não existir, DETECTAR (e propor criá-lo)

1. **Coluna de tenant**: `Grep` nas migrations por `company_id|unit_id|organization_id|tenant_id|account_id` em `create table`. A que mais aparece como FK `not null` é a coluna de tenant.
2. **Resolver**: `Grep` por `create ... function` cujo nome contenha `current_|get_current_|is_.*_member|has_role|current_unit`. Veja o corpo: lê `jwt.claims`/`app_metadata` → `jwt-claim`; faz `select ... from <membership> where user_id = auth.uid()` retornando bool → `membership-lookup`; retorna `setof`/`array` → `set`.
3. **Force trigger**: `Grep` por `force_` + `before insert`. Presente → `write_path: force-trigger`.
4. **Framework**: `package.json` (`next` → next-app; `vite` → vite; `apps/`+`turbo` → monorepo; `expo`).
5. **Super admin**: procure tabela `platform_admins`/coluna `is_super_admin`/`is_platform_admin`.

Registre a detecção no relatório e **sugira** materializar um `.claude/tenancy-profile.yml`. Se o essencial (coluna + resolver) ficar indeterminado, marque os itens dependentes como `INCONCLUSIVE` (ver skill [agent-result-contract]).

## Invariantes universais (valem em QUALQUER arquétipo — sempre exigir)

Estes não dependem do profile. São o núcleo de segurança:

1. **`FORCE ROW LEVEL SECURITY`** em toda tabela com dado de tenant (RLS comum não afeta o dono da tabela).
2. **Deny-by-default**: RLS habilitada e nenhuma policy permissiva `USING (true)` em tabela tenant-scoped.
3. **Policies com `USING` E `WITH CHECK`** em INSERT/UPDATE (só `USING` deixa inserir linha de outro tenant).
4. **Resolver `SECURITY DEFINER` + `STABLE` + `SET search_path`** (`= ''` ou `= public`) — sem isso há search_path hijack (CVE-grade) e o planner não faz cache.
5. **Cliente nunca escolhe o tenant**: o valor de tenant em escrita vem do servidor (trigger, resolver, ou `.eq(<col>)` server-side), nunca do payload do cliente.
6. **Super admin é autoridade SEPARADA do RBAC de tenant** — toda policy de tenant precisa de um ramo super-admin explícito OU o super é barrado; a autoridade nunca vem de `user_metadata` (o próprio usuário edita).
7. **Segredo/`service_role` nunca no bundle do cliente**; env pública só com o prefixo do framework (`client_env_prefix`).
8. **Índice na(s) coluna(s) de tenant** (RLS sem índice vira full scan).
9. **Multi-membership é o caso comum**: não presuma 1 tenant por usuário a menos que `membership.model: single`.
10. **Chamada externa/privilegiada encapsulada server-side** (`secrets_boundary`).

> A regra antiga "toda tabela tem `company_id` + trigger `force_company_id`" é **um** arquétipo, não um invariante. Não marque como violação a ausência de `force_company_id` num projeto cujo `write_path` é `server-scoped` ou `rpc-security-definer`.

## Arquétipos de referência

Carregue `reference.md` desta skill para os 4 arquétipos reais completos (com resolver, escrita e exemplo de policy de cada): **A** `company_id`+JWT+force-trigger, **B** `unit_id`+membership-lookup, **C** `organization_id`+`unit_id`+RBAC, **D** `unit_id`+set-returning. Ao gerar código novo em greenfield sem profile, **pergunte** qual arquétipo e crie o profile junto.

## Nomenclatura reutilizável

Núcleo neutro: `tenant` = a organização contratante (rótulo de UI = `display_term`); `unit` = filial/loja/workspace subordinado. Evite cravar `company_id` — o identificador técnico é `tenant.columns` do profile.
