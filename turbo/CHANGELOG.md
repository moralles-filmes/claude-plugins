# CHANGELOG

## [1.0.4] — 2026-10-08

### Corrigido
- `db-perf` Passo 6: o transaction mode do Supavisor é a porta **6543** (session mode 5432), não 6432. Acrescentado: desligar prepared statements no driver em transaction mode.
- `db-perf` Passo 4 recomendava evitar join na policy "quando um claim no JWT resolve". Isso contradiz o Padrão SaaS: permissões e empresa ativa são lidas do banco a cada requisição, para a revogação valer na seguinte. Agora: helper `STABLE` `SECURITY DEFINER` (`search_path = ''`, schema `private`) dentro de `(SELECT …)` e índice nas colunas que ele lê. O cache permitido é dentro da consulta (InitPlan).
- `auth.uid()`: o truque do `(SELECT …)` continua, mas no Padrão SaaS a policy chama `(SELECT private.current_user_id())`; `auth.uid()` direto só fora do padrão. Exemplo com `private.allowed_company_ids(...)`.
- README: instalação usava `turbo@moralles`; o marketplace se chama `morallesfilms-local`.

### Alterado
- `perf-guardrails`: o teste de isolamento ganha o caso "cache aquecido + membership removida → acesso perdido na requisição seguinte".
- `frontend-perf`: chave de query começa pela empresa ativa; trocar de empresa ou sair descarta o cache privado; permissões, saldo e estoque sem `staleTime` longo.

## [1.0.3] — 2026-09-18

### Alterado
- `db-perf`: descrição e Passo 4 (RLS multi-tenant) não citam mais "padrão MarginPro". Os exemplos com `company_id`/`get_current_company_id()` estão marcados como arquétipo A do `tenancy-profile` (saas-shield-br); a técnica do `(SELECT fn())` vale para qualquer resolver.

## [1.0.2] e anteriores

Sem changelog. Ver histórico do git.
