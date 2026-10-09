---
paths:
  - "supabase/migrations/**"
  - "supabase/seed*.sql"
  - "supabase/tests/**"
  - "**/*.sql"
  - "**/database/**"
---

# Banco de dados — ao tocar SQL ou migrations

Antes de criar ou alterar migration, policy, função ou índice, leia `docs/standards/DATABASE.md`, `docs/standards/MULTI_TENANCY.md` e, se a tabela pertence a um módulo, `docs/standards/ACCESS_CONTROL.md`.

Pontos que mais causam vazamento ou perda de dados:

- Migration já aplicada não é editada. Crie uma nova (forward-only).
- Toda tabela nova em schema exposto recebe, na **mesma** migration: RLS habilitada e forçada, policies e revisão dos grants de `anon`/`authenticated`.
- Tabela da empresa filtra por `company_id`; tabela da filial filtra por `location_id` e tem FK composta `(company_id, location_id)`. Policies usam os helpers com a permissão `ver` do submódulo dono.
- Policies de insert e update usam `with check`.
- Relacionamento entre tabelas do mesmo tenant usa FK composta `(company_id, <fk>)`. FK simples não garante o mesmo tenant, e a checagem de FK ignora RLS.
- Transição crítica (baixa, aprovação, estorno) não tem grant de update na coluna de estado: passa por RPC ou caso de uso que confere a ação.
- Permissão nova entra no catálogo (`permissions`) por migration, junto com a concessão aos papéis de sistema. Chave de permissão não é renomeada em lugar.
- Views em schema exposto usam `with (security_invoker = true)`.
- Funções `security definer`: `set search_path = ''`, nomes qualificados, fora de schema exposto salvo intenção explícita, checagem de tenant interna.
- Funções novas são executáveis por `PUBLIC` por padrão. Revogue e conceda explicitamente.
- Tabelas novas herdam os default privileges do Supabase (tudo para `anon` e `authenticated`). Revogue tudo e conceda só o necessário, na mesma migration.
- Usuário da requisição: `(select private.current_user_id())`, nunca `auth.uid()` direto. FK de usuário aponta para `public.app_users`, nunca para `auth.users`.
- Invariantes que dependem do estado atual (saldo, estoque, status) são garantidas na mesma transação da mutação.
- Valores monetários em `numeric` ou centavos inteiros, nunca float.
- Migration remota exige autorização explícita. Depois de aplicar localmente, rode os Advisors e `supabase test db`.
