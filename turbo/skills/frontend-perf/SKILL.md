---
name: frontend-perf
description: Diagnóstico e correção de performance de frontend React/Next.js — travamento de UI, lentidão ao navegar entre abas/telas, re-renders em cascata, long tasks, bundle grande, memory leaks, listas pesadas, INP ruim. Use sempre que o sintoma envolver interface travando, engasgando, demorando a responder ao clique/digitação, ou consumo de memória crescente durante o uso.
---

# Frontend Performance — React / Next.js

O sintoma "trava ao navegar" quase sempre é uma destas seis causas. Diagnostique na ordem de probabilidade × facilidade de confirmar. Confirme com evidência antes de corrigir — cada causa tem seu teste.

## Mapa de diagnóstico rápido

| Sintoma | Suspeito nº 1 | Como confirmar em minutos |
|---|---|---|
| Trava/engasga ao interagir | Long task na main thread | DevTools Performance → gravar interação → blocos vermelhos > 50ms |
| Trocar de tela recarrega tudo | Falta de cache de servidor (refetch) | Network tab: mesmos requests repetidos a cada navegação |
| Digitar em input pesado engasga | Re-render em cascata | React DevTools Profiler → "Highlight updates" pisca a tela toda |
| Tabela/lista grande lenta | DOM gigante sem virtualização | Elements tab: contar nós; > ~1500 linhas renderizadas = confirmado |
| Fica lento com o tempo de uso | Memory leak | Memory tab: 2 heap snapshots antes/depois de navegar; procurar detached nodes |
| Primeira carga lenta | Bundle grande / sem code splitting | `next build` output ou bundle analyzer; rota > 250KB gzip = confirmado |

## 1. Long tasks (bloqueio da main thread)

Qualquer tarefa JS > 50ms bloqueia input; a métrica é INP (< 200ms bom). No trace do Performance tab, clique na long task e veja o call stack — o culpado está lá.

Correções por padrão de causa:
- Cálculo pesado síncrono → mover para Web Worker, ou fatiar com `scheduler.yield()` / `requestIdleCallback`.
- Render pesado disparado por digitação → `useDeferredValue` no valor derivado ou `useTransition` na atualização pesada; o input continua responsivo e a parte pesada renderiza depois.
- Parse de JSON gigante / processamento de dados na chegada → Worker, ou processar no servidor.

## 2. Refetch sem cache (a causa mais comum de "navegação lenta")

Se trocar de aba refaz todos os fetches, o problema não é velocidade — é ausência de camada de server state.

- Instale/configure TanStack Query (ou use o cache do RSC no Next). O ponto crítico é `staleTime`: o default é 0, ou seja, TUDO é considerado velho e refetcha ao remontar. Configure `staleTime` por tipo de dado (listas de referência: minutos; dados vivos: segundos + realtime).
- Prefetch na intenção: `queryClient.prefetchQuery` no hover/focus do link da aba torna a navegação instantânea de verdade.
- No Next App Router: `<Link prefetch>` já ajuda para a rota; o dado é com a camada de query.

## 3. Re-renders em cascata (React)

Confirme com o React DevTools Profiler (flamegraph + "record why each component rendered"). Só depois corrija — memoização preventiva sem medição é ruído que piora legibilidade.

Causas em ordem de frequência:
1. **Context gordo**: um provider com objeto grande re-renderiza todos os consumidores a cada mudança de qualquer campo. Corrigir: dividir em contexts menores, ou trocar por um store com seletores (Zustand) onde o componente assina só a fatia que usa.
2. **Objeto/array/função nova a cada render passada como prop** para componente memoizado — quebra o memo silenciosamente. Corrigir com `useMemo`/`useCallback` APENAS nesses pontos.
3. **Estado no lugar errado**: estado que só um filho usa vivendo no pai. Descer o estado é a correção mais barata que existe.
4. **`key` instável em listas** (index como key em lista reordenável) — força remount, não re-render.
5. Subscription (Supabase Realtime, websocket) dentro de componente de item de lista — cada evento re-renderiza N componentes. Subir a subscription para um nível só.

## 4. DOM gigante / listas

Renderizar milhares de linhas mata Layout e Paint mesmo sem re-render. Virtualize com TanStack Virtual (agnóstico) — só o visível existe no DOM.

Relacionado: **layout thrashing** — ler medida do DOM (`offsetHeight`, `getBoundingClientRect`) logo após escrever style, dentro de loop, força layout síncrono repetido. Agrupar todas as leituras antes de todas as escritas, ou usar `requestAnimationFrame`.

Animações: animar apenas `transform` e `opacity` (compositor); animar `width/height/top/left` dispara Layout a cada frame.

## 5. Memory leaks

Sintoma-assinatura: app fica progressivamente mais lento quanto mais o usuário navega, e melhora com F5.

Caça: Memory tab → heap snapshot → usar o app (abrir/fechar a tela suspeita 3x) → novo snapshot → "Objects allocated between snapshot 1 and 2" → procurar `Detached` (nós de DOM desanexados retidos por JS).

Culpados clássicos em React + Supabase:
- `channel.subscribe()` sem `supabase.removeChannel(channel)` no cleanup do `useEffect`.
- `addEventListener` (window/document) sem remove no cleanup.
- `setInterval` sem clear.
- Closure em cache global (query cache com `gcTime: Infinity`, store) segurando referência a árvores grandes de dados.

## 6. Bundle e carregamento

- `@next/bundle-analyzer` (ou `vite-bundle-visualizer`) para ver o que compõe cada rota.
- Vilões recorrentes: import de biblioteca inteira (`import _ from 'lodash'` → importar a função; date libs pesadas → date-fns/dayjs), barrel files (`index.ts` reexportando tudo — quebra tree shaking), lib de gráficos/editor carregada em rota que não usa.
- `next/dynamic` (ou `React.lazy`) para componentes pesados abaixo da dobra ou atrás de interação (modal, editor, gráfico).
- Imagens: `next/image` ou pelo menos dimensões explícitas + lazy — imagem sem dimensão causa layout shift E trabalho de layout.

## Ordem de ataque recomendada

Quando várias causas coexistem (comum), corrija na ordem de custo/benefício: (1) cache de queries com staleTime, (2) virtualização de listas, (3) code splitting das rotas pesadas, (4) re-renders confirmados no Profiler, (5) leaks, (6) micro-otimizações — e pare quando o INP e a navegação atingirem o orçamento.

Cada correção segue o protocolo do workflow `perf-audit`: medir antes, corrigir um item, medir depois, registrar no FINDINGS.md.
