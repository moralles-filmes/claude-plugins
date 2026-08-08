# TURBO 🏎️

Agente sênior de performance para Claude Code. Audita, mede, corrige e protege sistemas ponta a ponta — frontend (React/Next), banco (Postgres/Supabase/RLS multi-tenant), rede e infra — **sem quebrar nada e sem regredir depois**.

## Uso

```
/turbo                          # auditoria completa (ou retoma se houver .turbo/STATE.md)
/turbo tela de pedidos travando # auditoria focada num sintoma
/turbo resume                   # retoma auditoria interrompida
/turbo status                   # resumo do estado atual, sem executar nada
```

Ou em linguagem natural: "turbo, o sistema tá lento ao trocar de aba".

## O que ele faz de diferente

- **Mede antes de mexer.** Baseline numérico gravado em `.turbo/BASELINE.md` antes de qualquer mudança. Todo delta é provado.
- **Estado em disco, não em contexto.** Todo o progresso vive em `.turbo/` (STATE, BASELINE, FINDINGS, PLAN, REPORT). Sessão caiu, contexto compactou? `/turbo resume` continua exatamente de onde parou.
- **Exploração via subagentes.** Varreduras pesadas de código rodam em subagentes que devolvem só o resumo — o contexto principal não incha em sistema grande.
- **Não quebra nada.** Characterization tests antes de refatorar código sem cobertura; uma otimização por commit; teste de isolamento obrigatório ao tocar RLS.
- **Não regride.** Budgets em CI (bundle, Lighthouse, k6), RUM com alerta em p95, relatório final documentando cada guarda-corpo.
- **Sabe parar.** Orçamento atingido = trabalho encerrado.

## Componentes

| Componente | Papel |
|---|---|
| `agents/turbo.md` | O agente: princípios, método, protocolo de contexto |
| `commands/turbo.md` | Comando `/turbo` (audit / focado / resume / status) |
| `skills/perf-audit` | Workflow orquestrador em 6 fases com checkpoints |
| `skills/frontend-perf` | React/Next: long tasks, re-renders, cache, virtualização, leaks, bundle |
| `skills/db-perf` | Postgres/Supabase: EXPLAIN, índices, RLS multi-tenant, N+1, pooling |
| `skills/perf-guardrails` | Characterization tests, refatoração segura, budgets em CI |

## Instalação

```
/plugin marketplace add moralles-filmes/claude-plugins
/plugin install turbo@moralles
```
