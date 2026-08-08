---
name: perf-guardrails
description: Como otimizar sem quebrar comportamento e como impedir que ganhos de performance regridam com o tempo — characterization tests, refatoração segura de código legado sem testes, budgets de performance em CI, testes de regressão de RLS/segurança. Use SEMPRE antes de refatorar código sem cobertura de testes, ao concluir qualquer otimização, e ao mexer em policies RLS ou lógica de negócio durante otimização.
---

# Guarda-corpos — Otimizar Sem Quebrar e Sem Regredir

Duas metades: (A) garantir que a otimização não muda comportamento AGORA; (B) garantir que o ganho não evapora DEPOIS. Uma otimização sem guarda-corpo é um empréstimo, não um ganho.

## A. Não quebrar agora

### Characterization tests (código sem testes)

Antes de refatorar código sem cobertura, capture o comportamento ATUAL — inclusive o esquisito. O teste não afirma o que o código deveria fazer; afirma o que ele FAZ. (Referência: *Working Effectively with Legacy Code*, Feathers.)

Receita rápida:
1. Identifique entradas representativas da função/endpoint/componente: caso típico, vazio, limite, e o caso estranho que aparecer no código (aquele `if` misterioso — ele existe por algum motivo).
2. Rode o código atual com essas entradas e grave as saídas como esperadas (snapshot é aceitável aqui — é exatamente o caso de uso legítimo de snapshot testing).
3. Só então refatore. Testes verdes = comportamento preservado.
4. Se durante a captura você achar um bug: NÃO conserte junto com a otimização. Registre, capture o comportamento bugado no teste com um comentário, e trate em mudança separada. Misturar correção de bug com otimização torna as duas impossíveis de reverter isoladamente.

Para endpoints/APIs: golden tests — gravar request/response reais (dados anonimizados) e comparar pós-refatoração, ignorando campos voláteis (timestamps, ids gerados).

### Regras de mudança segura

- **Uma otimização por commit/PR**, com o número antes/depois no corpo. Reverter tem que ser trivial.
- **Equivalência primeiro, velocidade depois**: em refatorações grandes, primeiro reestruture mantendo comportamento (testes verdes), depois otimize na estrutura nova. Nunca as duas coisas no mesmo passo.
- **Mudança arriscada = feature flag + rollout gradual** (5% → 25% → 100%), com a métrica-alvo e a taxa de erro observadas em cada degrau.
- **Cache introduzido = plano de invalidação escrito ANTES do cache.** Cache sem invalidação definida é bug de consistência agendado. Documentar: o que invalida, quando, e o pior caso de dado velho aceitável (TTL).

### RLS e segurança (crítico em multi-tenant)

Qualquer mudança em policy RLS durante otimização exige teste de isolamento que prove: autenticado como tenant A, (1) SELECT não retorna linhas do tenant B; (2) INSERT/UPDATE forjando `company_id` do tenant B falha; (3) usuário anônimo não lê nada de tabela protegida. Rodar antes e depois da mudança. Otimização que vaza dado entre tenants não é otimização — é incidente.

## B. Não regredir depois

### Budget de performance em CI

Transformar o orçamento acordado na auditoria em verificação automática. Em ordem de custo de implantação:

1. **Bundle size** (mais barato, maior retorno): `size-limit` ou o próprio budget do framework. Falha o build se a rota passar do limite. É o guarda-corpo com melhor custo/benefício que existe — bundle regride silenciosamente a cada dependência nova.
2. **Lighthouse CI** nas rotas-chave com assertions (LCP, TBT, INP em lab): roda no PR contra preview deploy (Vercel facilita isso).
3. **Teste de carga leve** (k6) nos endpoints críticos com threshold de p95: não precisa ser o load test da vida — 30s a RPS realista com `http_req_duration p(95) < X` já pega regressão grosseira.
4. **Query regression**: para as queries que foram otimizadas, um teste que roda `EXPLAIN` em staging e falha se voltar Seq Scan na tabela grande (frágil, usar só nas 2-3 queries mais críticas).

Regra de sanidade: CI de performance com variância alta vira ruído e o time passa a ignorar. Prefira métricas estáveis (bytes, contagem de queries por request, presença de índice no plano) a métricas de tempo em runner compartilhado; para tempo, use thresholds folgados (regressão de 30%+, não 5%).

### Monitoramento contínuo

- RUM ligado (Vercel Speed Insights / Sentry Performance) com alerta em **p95**, nunca em média.
- `pg_stat_statements` revisado periodicamente — a query lenta de amanhã ainda não existe hoje.
- Contagem de requests por tela como métrica acompanhada: N+1 reintroduzido aparece aqui antes de aparecer na latência.

### Registro

Todo ganho fixado entra no `.turbo/REPORT.md` com: métrica, antes → depois, guarda-corpo instalado (qual e onde), e data. Sem registro, em 6 meses ninguém sabe por que aquele `staleTime` existe e alguém "limpa" o código.
