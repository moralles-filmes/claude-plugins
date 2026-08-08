---
name: db-perf
description: Diagnóstico e correção de performance de banco de dados Postgres/Supabase — queries lentas, N+1, índices, planos de execução, RLS multi-tenant lento, paginação, connection pooling, cache. Use sempre que o sintoma envolver API demorando, timeout, tela esperando dados, query lenta, ou sistemas multi-tenant com RLS (padrão MarginPro) apresentando lentidão.
---

# Database Performance — Postgres / Supabase

Regra nº 1: o banco te conta exatamente onde dói, se você perguntar direito. Nunca otimize query por leitura de código — peça o plano.

## Passo 1: achar as queries que importam

```sql
-- Top ofensoras por tempo total (o que domina o servidor)
SELECT calls, round(total_exec_time::numeric, 1) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       rows, left(query, 120) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 15;

-- Top por média (o que dói por request)
-- mesma query, ORDER BY mean_exec_time DESC
```

Atenção às duas listas: query de 20ms chamada 50.000x/dia domina o servidor (candidata a cache/batch); query de 3s chamada 10x/dia domina a experiência de quem a usa (candidata a índice/reescrita). São problemas diferentes com soluções diferentes.

No Supabase: Dashboard → Database → Query Performance já expõe isso; via SQL o `pg_stat_statements` está habilitado por padrão.

## Passo 2: ler o plano

```sql
EXPLAIN (ANALYZE, BUFFERS) <query>;
```

O que procurar, em ordem:
- **Seq Scan em tabela grande** com filtro seletivo → índice faltando, ou existente mas inutilizado (cast implícito, função sobre a coluna no WHERE, operador incompatível com o tipo de índice).
- **Rows estimado vs real muito discrepante** (10x+) → estatísticas velhas (`ANALYZE tabela`) ou correlação que o planner não vê → planos ruins em cadeia.
- **Buffers: read alto** → dados frios vindo de disco; `shared hit` alto com tempo alto → CPU/volume de linhas processadas.
- **Nested Loop com inner Seq Scan** repetido milhares de vezes → índice na coluna de join.
- **Sort com `external merge` (disk)** → `work_mem` insuficiente para a operação, ou faltou índice que entregaria a ordem de graça.
- **Filter descartando quase tudo** depois de ler muito → o índice/condição certa deveria filtrar antes.

## Passo 3: índices com critério

- Composto: coluna de igualdade primeiro, range/ordenação depois — `(company_id, created_at)` serve `WHERE company_id = X ORDER BY created_at`, o inverso não.
- Parcial para subconjuntos quentes: `CREATE INDEX ... WHERE status = 'active'` — menor, mais rápido, cabe em cache.
- Covering (`INCLUDE`) quando a query só precisa de poucas colunas → Index Only Scan.
- GIN para jsonb/arrays/full-text; b-tree não serve para `@>` e `?`.
- Higiene: índice não usado custa em cada escrita. Auditar com `pg_stat_user_indexes` (idx_scan = 0 há meses → candidato a remoção — confirmar que não serve a constraint/relatório raro antes).
- Criar índice em produção: sempre `CREATE INDEX CONCURRENTLY` (fora de transaction block).

## Passo 4: RLS multi-tenant (padrão MarginPro)

RLS mal escrita é o assassino silencioso de multi-tenant. As três armadilhas, em ordem de impacto:

**1. Função avaliada por linha.** Policy como `USING (company_id = get_current_company_id())` pode ser executada uma vez POR LINHA examinada. A correção é embrulhar em subselect para virar InitPlan (avaliada uma vez):

```sql
-- LENTO: por linha                       -- RÁPIDO: uma vez (InitPlan)
USING (company_id = get_current_company_id())
                                          USING (company_id = (SELECT get_current_company_id()))
```

O mesmo vale para `auth.uid()` e `auth.jwt()`. Diferenças de 100x+ são normais. Confirmar no EXPLAIN: a função deve aparecer como `InitPlan`, não dentro do Filter.

**2. Coluna da policy sem índice.** Toda coluna usada em policy (`company_id`, `user_id`) precisa de índice — a policy vira um WHERE invisível em TODAS as queries da tabela.

**3. Marcar funções corretamente.** Funções usadas em policies devem ser `STABLE` (não `VOLATILE`, o default) para o planner poder otimizá-las; `SECURITY DEFINER` quando precisam ler tabela de membership sem recursão de RLS — e nesse caso, sempre com `SET search_path = ''` fixado.

Checklist extra: policies separadas por operação (SELECT/INSERT/UPDATE/DELETE) em vez de uma `FOR ALL` complexa; evitar join dentro da policy quando um claim no JWT resolve.

## Passo 5: padrões de acesso (onde APIs morrem)

- **N+1**: uma tela fazendo 1 query de lista + N queries de detalhe. No Supabase, resolver com select aninhado (`.select('*, items(*)')`), RPC que agrega, ou view. Detectar: contar requests da tela no Network tab.
- **Over-fetching**: `select('*')` trazendo 40 colunas para renderizar 4 — pior ainda com colunas jsonb/text grandes. Selecionar colunas explícitas.
- **Paginação**: `OFFSET 10000` lê e descarta 10.000 linhas. Migrar para keyset: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 50`.
- **`count: 'exact'`** em tabela grande a cada page load é caro; usar `estimated`/`planned` quando o número exato não importa.
- **Round-trips**: várias queries sequenciais que poderiam ser 1 RPC/função. Latência de rede × N é frequentemente maior que o tempo de query somado — especialmente se função (Vercel) e banco (Supabase) estão em regiões diferentes. Verificar as regiões: um cross-region custa ~100-150ms por round-trip e nenhum índice conserta.

## Passo 6: pooling e cache

- Serverless (Vercel) + Postgres exige pooler: usar a connection string do **transaction mode** (porta 6432 no Supavisor) para functions; session mode só para quem precisa de prepared statements/features de sessão. Sintoma de pooling errado: erros de "too many connections" ou latência de connect alta em cold start.
- Camadas de cache, da mais barata para a mais cara de invalidar: CDN/edge para dados públicos → cache HTTP (`Cache-Control`, `stale-while-revalidate`) → cache de aplicação (TanStack Query no front, `unstable_cache`/revalidate no Next) → view materializada para agregações pesadas (com estratégia de refresh definida).
- Desnormalização deliberada (coluna computada mantida por trigger) quando leitura domina e o join é comprovadamente o custo — só com número na mão.

## Anti-regras

- NUNCA rodar migration de otimização sem testar em branch/staging com volume realista — plano de execução muda com o tamanho dos dados.
- NUNCA remover índice/constraint sem verificar uso em `pg_stat_user_indexes` e dependências.
- Mudança em policy RLS = mudança de segurança: exigir teste que prove que tenant A continua sem ver dados do tenant B (ver skill perf-guardrails).
