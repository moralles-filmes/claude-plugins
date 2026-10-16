# code-health

Plugin para Claude Code focado em **manter projetos JS/TS/React/Next.js limpos e funcionais**. Faz três coisas, bem:

1. **Dead-code cleanup** — varre o projeto procurando arquivos órfãos, imports/exports não usados, dependências esquecidas no `package.json`, assets em `public/` sem referência e código comentado.
2. **Functional audit** — encontra botões fantasma (sem handler ou só com `console.log`), rotas quebradas, dados mockados em rotas de produção, funções stub (`return Promise.resolve()`), `catch {}` vazios, TODOs antigos.
3. **Supabase audit** (opcional, ativa só em projeto com `supabase/`) — cruza schema declarado em `supabase/migrations/` + `supabase/functions/` com referências em `src/`: acha typos em `.from('x')` (tabelas e views), buckets de Storage não declarados (`storage.from('b')`, reportados como INCONCLUSIVE, nunca como tabela quebrada), invokes quebrados, colunas provavelmente erradas, tabelas/funções dead, Realtime sem cleanup.

## Filosofia

- **Report-first.** Toda varredura gera um relatório. Nada é editado sem aprovação.
- **Severidade clara.** Cada finding tem nível de confiança ou severidade explícito.
- **Checkpoint git.** Antes de qualquer remoção/fix, branch nova + commit de checkpoint.
- **Específico para Next.js.** Sabe que `app/page.tsx` não é dead code; conhece os patterns do App Router.

## Skills

| Skill | Trigger típico |
|---|---|
| `dead-code-cleanup` | "limpa o código morto", "remove o que não está em uso", "find unused" |
| `functional-audit` | "ache os bugs", "remove os mocks", "deixa pronto pra produção" |

## Slash commands

| Comando | O que faz |
|---|---|
| `/code-health:cleanup [scope]` | Varredura de dead code (scope: `full|imports|deps|assets|files`) |
| `/code-health:audit [scope]` | Auditoria funcional (scope: `full|buttons|routes|mocks|stubs|handlers|todos`) |
| `/code-health:audit-supabase` | Auditoria cruzada Supabase (migrations vs src/) — só roda se houver `supabase/` |
| `/code-health:health` | Roda dead code + auditoria funcional em paralelo, resume a portabilidade quando o projeto tem `scripts/check-portabilidade.mjs` e gera relatório consolidado |

## Subagents

| Subagent | Quando é invocado |
|---|---|
| `dead-code-scanner` | Pelo skill `dead-code-cleanup` para varredura paralela (knip + ts-prune + depcheck + eslint + ripgrep) |
| `functional-auditor` | Pelo skill `functional-audit` para varredura paralela dos 7 detectores |
| `supabase-auditor` | Pelo `/code-health:audit-supabase` e pela wave Code Health do `saas-audit-br` — 7 detectores específicos de Supabase (broken-table, storage-bucket-unverified, broken-invoke, unknown-column, dead-table, dead-edge-function, realtime-no-cleanup) |

Os subagents são **read-only** — escrevem findings em `.code-health/*.json` (intermediários em `.code-health/work/<agente>/`) e retornam apenas o caminho e um sumário. O agente principal lê o JSON e produz o relatório markdown. `.code-health/` entra no `.git/info/exclude` na primeira execução: não suja o `git status` e não mexe no `.gitignore`. Nada vai para `/tmp` com nome fixo, então dois projetos auditados ao mesmo tempo não se sobrescrevem.

## Como funciona — fluxo típico

```
Você: "Limpa o código morto desse projeto"
  ↓
Claude (skill: dead-code-cleanup)
  ↓
Fase 1 — Reconhecimento (detecta Next.js, pnpm, etc.)
Fase 2 — Subagent dead-code-scanner roda 6 detectores
Fase 3 — Classifica findings em alta/média/baixa confiança
Fase 4 — Gera ./code-health-reports/dead-code-<ts>.md
Fase 5 — PARA e pergunta: "Aplicar Lote 1 (alta confiança, X itens)?"
  ↓
Você: "Sim"
  ↓
Claude:
  - git checkout -b cleanup/dead-code-<data>
  - aplica em lotes
  - npx tsc --noEmit + pnpm build após cada lote
  - git commit por categoria
  - reverte e reporta se quebrar
```

## Onde ele NÃO te ajuda

- **Refatoração** (extrair função, renomear): use o code-review nativo do Claude Code
- **Performance**: este plugin não otimiza, só limpa (use o plugin `turbo`; para reduzir a conta de Supabase/Vercel, `cost-optimizer` do `saas-shield-br`)
- **Type safety**: não conserta tipos errados, só remove código
- **Bugs específicos**: este plugin acha *padrões* não-funcionais; bugs concretos pedem o skill `engineering:debug`
- **Segurança/RLS/secrets**: use o plugin `saas-shield-br` (mesmo marketplace)

## Padrões reconhecidos especificamente para Next.js

O plugin sabe que estes paths NÃO são dead code mesmo sem imports explícitos:

- `app/**/page.tsx` (App Router)
- `app/**/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- `app/api/**/route.ts` e `pages/api/**`
- `middleware.ts`, `instrumentation.ts`
- Server Actions com `'use server'`
- `generateMetadata`, `generateStaticParams`
- Configs (`next.config.*`, `tailwind.config.*`, `drizzle.config.*`)
- Imagens em `public/` referenciadas via path string

## Segurança

- Nenhuma remoção sem `git status` limpo + branch nova
- Máximo 50 arquivos por commit
- Smoke test (`tsc --noEmit` + `build`) entre lotes
- Reversão automática (`git reset --hard`) se algum lote quebrar build/test

## Limitações conhecidas

- Cobertura limitada a JS/TS/React/Next.js. Outros frameworks (Vue, Svelte, Astro) podem funcionar mas sem patterns dedicados.
- Detector de assets órfãos em `public/` é conservador — assets carregados via CMS/banco podem ser falsos positivos.
- Detector de broken-routes não cobre rotas geradas dinamicamente em runtime.
- Stubs detectados por heurística — funções legítimas que retornam `null` podem aparecer como falso positivo (classificadas como MEDIUM, não BLOCKER).

## Portabilidade (Padrão SaaS)

Projeto com o Padrão SaaS tem `scripts/check-portabilidade.mjs`, que mede acesso direto ao Supabase fora dos adapters. O `/code-health:health` (e o `functional-audit`) roda o script e inclui o resumo no relatório — total por regra, arquivos acima da linha de base, top arquivos. O code-health não reimplementa essa checagem, não grava linha de base e não refatora para portabilidade; a classificação P2/P3 e o plano por módulo ficam com o `saas-audit-br`.

## Combinação com saas-shield-br

Os dois plugins são complementares. Workflow recomendado para releases críticos:

```
/code-health:health        → veredito + plano priorizado
/saas-shield-br:pre-deploy → segurança + RLS + secrets + Vercel config
```

Para auditoria completa (inclusive a Fase 6 do `saas-builder-br`), o `saas-audit-br` orquestra os três subagents deste plugin junto com o shield.

## Licença

MIT
