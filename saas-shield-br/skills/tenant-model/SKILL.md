---
name: tenant-model
description: Fonte única da verdade sobre o modelo multi-tenant de um projeto. NÃO assume company_id — descreve o "tenancy-profile" (contrato configurável de tenancy), como lê-lo, como detectá-lo quando ausente, os invariantes universais que valem em qualquer arquétipo, e os 5 arquétipos de referência (company_id/JWT, unit/membership, org+unit/RBAC, unit/set, e E — company_id+location_id com permissões por módulo, padrão do plugin padrao-saas). Pré-carregue em todo agente que audita ou gera RLS, migrations ou isolamento de tenant.
---

# tenant-model

Este plugin **não** tem um esquema de tenant único. Projetos reais divergem: alguns usam `company_id` com claim de JWT, outros `unit_id` com membership, outros `organization_id`+`unit_id` com RBAC. **Antes de auditar ou gerar qualquer coisa relacionada a tenant, resolva a convenção do projeto.** Nunca hardcode `company_id`.

## Passo 1 — Ler o `tenancy-profile`

Procure `.claude/tenancy-profile.yml` (ou `.json`/`.md`) na raiz do repo. Projeto do Padrão SaaS usa o modelo do `padrao-saas:aplicar` (arquétipo E, com `locations`, `roles.helpers` e `entitlements`). Formato canônico (campos comuns a todos os arquétipos; o exemplo é um projeto D):

```yaml
archetype: D                 # A | B | C | D | E  (projeto novo: E)
framework: next-app          # vite | next-app | next-pages | monorepo | expo | fastify
tenant:
  columns: [unit_id]         # ex.: [company_id] | [unit_id] | [organization_id, unit_id]
  resolver: current_unit_ids # nome da função canônica de resolução de tenant
  resolver_kind: set         # jwt-claim | membership-lookup | set
  force_trigger: false       # existe trigger *_force_<col> que deriva o tenant no servidor?
  write_path: server-scoped  # force-trigger | server-scoped | rpc-security-definer
  active_source: url         # de onde vem o tenant ativo: url | jwt-claim | session
locations:                   # só quando há filial abaixo do tenant (E)
  enabled: false
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
rls_helper_namespace: app         # private (E) | app | public (schema dos helpers de RLS)
display_term: Unidade             # rótulo de UI: Empresa | Organização | Unidade | Workspace | Clínica | Restaurante
```

Trate cada campo como um **parâmetro**: onde a regra antiga dizia `company_id`, use `tenant.columns`; onde dizia `get_current_company_id()`, use `tenant.resolver`; etc.

## Passo 2 — Se o profile não existir, DETECTAR (e propor criá-lo)

1. **Coluna de tenant**: `Grep` nas migrations por `company_id|unit_id|organization_id|tenant_id|account_id` em `create table`. A que mais aparece como FK `not null` é a coluna de tenant.
2. **Resolver**: `Grep` por `create ... function` cujo nome contenha `current_|get_current_|is_.*_member|has_role|current_unit|allowed_company_ids|allowed_location_ids`. Veja o corpo: lê `jwt.claims`/`app_metadata` → `jwt-claim`; faz `select ... from <membership> where user_id = auth.uid()` (ou `private.current_user_id()`) retornando bool → `membership-lookup`; retorna `setof`/`array` → `set`. `private.current_user_id()` + `private.allowed_*_ids` → arquétipo E.
3. **Force trigger**: `Grep` por `force_` + `before insert`. Presente → `write_path: force-trigger`.
4. **Framework**: `package.json` (`next` → next-app; `vite` → vite; `apps/`+`turbo` → monorepo; `expo`).
5. **Super admin**: procure tabela `platform_admins`/coluna `is_super_admin`/`is_platform_admin`.

Registre a detecção no relatório e **sugira** materializar um `.claude/tenancy-profile.yml`. Se o essencial (coluna + resolver) ficar indeterminado, marque os itens dependentes como `INCONCLUSIVE` (ver skill [agent-result-contract]).

## Invariantes universais (valem em QUALQUER arquétipo — sempre exigir)

Estes não dependem do profile. São o núcleo de segurança:

1. **`FORCE ROW LEVEL SECURITY`** em toda tabela com dado de tenant (RLS comum não afeta o dono da tabela).
2. **Deny-by-default**: RLS habilitada e nenhuma policy permissiva `USING (true)` em tabela tenant-scoped.
3. **Policies com `USING` E `WITH CHECK`** em INSERT/UPDATE (só `USING` deixa inserir linha de outro tenant).
4. **Resolver `SECURITY DEFINER` + `STABLE` + `SET search_path = ''`** com nomes qualificados — sem isso há search_path hijack (CVE-grade) e o planner não faz cache. `= public` ainda aparece em projetos antigos: não é bloqueante, registre como P2 e proponha a troca.
5. **O cliente indica, o servidor/banco decide**: o cliente pode indicar o tenant (empresa ativa da URL, header `x-company-id`, `company_id` no insert), mas o valor só vale depois de uma confirmação independente — `with check` chamando o resolver, trigger que deriva o tenant, ou membership conferida no servidor. Tenant do payload usado sem essa confirmação (sobretudo com `service_role`) é bypass. Em projeto novo, o tenant ativo **não** vem de claim do JWT (`active_source: url`).
6. **Super admin é autoridade SEPARADA do RBAC de tenant** — toda policy de tenant precisa de um ramo super-admin explícito OU o super é barrado; a autoridade nunca vem de `user_metadata` (o próprio usuário edita).
7. **Segredo/`service_role` nunca no bundle do cliente**; env pública só com o prefixo do framework (`client_env_prefix`).
8. **Índice na(s) coluna(s) de tenant** (RLS sem índice vira full scan).
9. **Multi-membership é o caso comum**: não presuma 1 tenant por usuário a menos que `membership.model: single`.
10. **Chamada externa/privilegiada encapsulada server-side** (`secrets_boundary`).
11. **Grants explícitos**: `revoke all … from anon, authenticated` e grant só do necessário, na migration da tabela. Não depender dos default privileges do Supabase.
12. **FK composta com a coluna de tenant** entre tabelas do mesmo tenant (checagem de FK ignora RLS).

> A regra antiga "toda tabela tem `company_id` + trigger `force_company_id`" é **um** arquétipo, não um invariante. Não marque como violação a ausência de `force_company_id` num projeto cujo `write_path` é `server-scoped` ou `rpc-security-definer`.

## Arquétipos de referência

Carregue `reference.md` desta skill para os 5 arquétipos completos (com resolver, escrita e exemplo de policy de cada): **A** `company_id`+JWT+force-trigger, **B** `unit_id`+membership-lookup, **C** `organization_id`+`unit_id`+RBAC, **D** `unit_id`+set-returning, **E** `company_id`+`location_id`+permissões por módulo (padrão do Padrão SaaS). Ao gerar código novo em greenfield sem profile, **proponha o E**, confirme com o usuário e crie o profile junto. Projeto que segue o Padrão SaaS tem as normas em `docs/standards/` (MULTI_TENANCY, ACCESS_CONTROL); use-as como referência dos achados.

## Nomenclatura reutilizável

Núcleo neutro: `tenant` = a organização contratante (rótulo de UI = `display_term`); `unit` = filial/loja/workspace subordinado. Evite cravar `company_id` — o identificador técnico é `tenant.columns` do profile.
