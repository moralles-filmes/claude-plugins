---
name: perf-audit
description: Workflow completo de auditoria de performance em fases, com estado persistido em disco. Use sempre que for auditar, diagnosticar ou otimizar a performance de um sistema — seja auditoria geral ("o sistema está lento") ou focada ("essa tela trava"). Use também para retomar auditorias interrompidas (existe .turbo/STATE.md). Este é o workflow orquestrador do agente turbo; as skills frontend-perf, db-perf e perf-guardrails são consultadas a partir daqui.
---

# Auditoria de Performance — Workflow em Fases

Auditoria séria é um processo com fases, estado e critério de parada. Este workflow existe para que a auditoria sobreviva a qualquer tamanho de sistema e a qualquer perda de contexto: cada fase termina gravando estado em `.turbo/`.

## Regra de ouro do workflow

**Ao final de CADA fase**: atualize `.turbo/STATE.md` (fase concluída, próximo passo) e dê ao usuário um resumo de 3-5 linhas. Nunca avance duas fases sem checkpoint. Se o contexto for perdido em qualquer ponto, a próxima sessão lê `.turbo/STATE.md` e retoma sem perder nada.

## Fase 0 — Escopo e definição de "lento"

Antes de abrir qualquer arquivo:

1. Pergunte (ou extraia da conversa): **qual fluxo** dói? Qual a **métrica** e o **alvo**? Quem reclama — todos os usuários ou os de conexão/máquina fraca?
2. Identifique a stack lendo apenas: `package.json`, config do framework (`next.config.*`, `vite.config.*`), estrutura de pastas de 1º nível, e existência de `supabase/`, `prisma/`, `docker-compose`. NÃO leia código-fonte ainda.
3. Defina o **orçamento de performance** com o usuário. Padrões de partida, ajustáveis:
   - Interação (INP): < 200ms
   - Navegação entre telas já visitadas: < 300ms (percepção de instantâneo com cache)
   - Query p95: < 100ms
   - Bundle JS inicial: < 250KB gzip
4. Crie `.turbo/STATE.md` e `.turbo/BASELINE.md` (ainda vazio de números).

**Checkpoint da Fase 0** — STATE.md deve conter: fluxos-alvo, orçamento acordado, stack detectada.

## Fase 1 — Baseline (medir antes de tocar)

Meça o estado atual dos fluxos-alvo e grave em `.turbo/BASELINE.md`:

- **Frontend**: se houver dados de RUM (Vercel Speed Insights, Sentry), use-os — lab data mente. Senão, rode Lighthouse/build de produção local e anote LCP, INP, TBT, tamanho de bundle (`next build` já imprime os tamanhos por rota).
- **Banco**: se `pg_stat_statements` estiver disponível, capture o top 10 por `total_exec_time` e por `mean_exec_time`. Senão, ative `auto_explain` ou instrumente as queries do fluxo-alvo.
- **API/rede**: latência p50/p95 dos endpoints do fluxo-alvo; contagem de requests por tela (waterfall).

Formato do BASELINE.md — uma tabela: métrica | valor atual | alvo | ferramenta usada | data. Essa tabela é a régua de todo o resto.

**Se não há como medir** (sem acesso a prod, sem RUM): diga isso explicitamente, meça o que der em ambiente local, e marque no BASELINE.md que os números são de lab.

## Fase 2 — Profiling e caça aos suspeitos

Agora sim, investigar. Regras de eficiência de contexto:

- Delegue varreduras amplas a **subagentes** (ex.: "liste componentes que renderizam listas com .map sem virtualização", "encontre queries com select * ", "ache useEffect com fetch sem cache"). Receba apenas achados sintetizados.
- Você mesmo lê apenas os arquivos apontados como suspeitos, e apenas os trechos relevantes.

Por camada, consulte a skill específica para saber O QUE procurar e COMO confirmar:

- Sintomas de UI (travar, engasgar, re-render, navegação lenta, memória crescendo) → skill **frontend-perf**
- Sintomas de dados (query lenta, tela esperando API, timeout, N+1, RLS) → skill **db-perf**
- Sintoma ambíguo ("tudo lento") → meça primeiro onde o tempo é gasto: DevTools Network waterfall responde em 2 minutos se o gargalo é rede/backend (barras longas esperando resposta) ou frontend (resposta rápida mas tela demora a reagir).

Cada achado confirmado vai para `.turbo/FINDINGS.md` neste formato (máx. 5 linhas por achado):

```
## F-003: Listagem de pedidos re-renderiza árvore inteira a cada tick do realtime
- Onde: src/components/OrderList.tsx:47
- Evidência: React Profiler mostra 340ms de render por evento; 200 linhas no DOM sem virtualização
- Custo estimado: ALTO (afeta fluxo principal)
- Correção: virtualizar com TanStack Virtual + mover subscription para fora do componente de linha
- Risco: BAIXO | Esforço: 2h | Status: pendente
```

## Fase 3 — Plano priorizado

Monte `.turbo/PLAN.md`: os achados ordenados por **custo × esforço × risco**. Regras:

- Correção barata e de baixo risco primeiro (índice, cache, virtualização, memo pontual), arquitetura por último.
- Máximo de 5 itens no plano ativo. O resto fica em "backlog" no mesmo arquivo.
- Apresente o plano ao usuário e **espere aprovação antes de mexer em código**.

## Fase 4 — Execução (um item por vez)

Para cada item aprovado:

1. Se o código afetado não tem testes, escreva characterization tests antes (ver skill **perf-guardrails**).
2. Implemente a correção — só ela, nada de "aproveitar e arrumar" outras coisas no caminho.
3. Meça de novo a métrica do BASELINE.md afetada. Grave o delta no FINDINGS.md (`Status: corrigido | antes 340ms → depois 12ms`).
4. Commit isolado com o número no corpo da mensagem.
5. Se o ganho medido for irrelevante (< 10% da métrica-alvo), considere reverter — código mais complexo sem ganho é dívida, não otimização.

## Fase 5 — Guarda-corpos e encerramento

1. Fixe os ganhos com a skill **perf-guardrails** (budget em CI, teste de regressão, alerta).
2. Escreva o relatório final em `.turbo/REPORT.md`: tabela antes/depois de todas as métricas, achados corrigidos, backlog restante, e guarda-corpos instalados.
3. Se o orçamento foi atingido: **declare o trabalho encerrado**. Não continue otimizando por inércia.

## Retomada de auditoria interrompida

Se `.turbo/STATE.md` existe ao iniciar: leia STATE.md → PLAN.md → últimas entradas do FINDINGS.md, nessa ordem, e continue da fase registrada. Não repita fases concluídas. Confirme com o usuário em 2 linhas: "Retomando da Fase N, próximo passo é X. Confirma?"
