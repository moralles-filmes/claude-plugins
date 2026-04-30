# code-health

Plugin para Claude Code focado em **manter projetos JS/TS/React/Next.js limpos e funcionais**. Faz duas coisas, bem:

1. **Dead-code cleanup** — varre o projeto procurando arquivos órfãos, imports/exports não usados, dependências esquecidas no `package.json`, assets em `public/` sem referência e código comentado.
2. **Functional audit** — encontra botões fantasma (sem handler ou só com `console.log`), rotas quebradas, dados mockados em rotas de produção, funções stub (`return Promise.resolve()`), `catch {}` vazios, TODOs antigos.

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
| `/code-health:health` | Roda os dois em paralelo e gera relatório consolidado |

## Subagents

| Subagent | Quando é invocado |
|---|---|
| `dead-code-scanner` | Pelo skill `dead-code-cleanup` para varredura paralela (knip + ts-prune + depcheck + eslint + ripgrep) |
| `functional-auditor` | Pelo skill `functional-audit` para varredura paralela dos 7 detectores |

Os subagents são **read-only** — escrevem findings em `/tmp/*.json` e retornam apenas um sumário. O agente principal lê o JSON e produz o relatório markdown.

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
- **Performance**: este plugin não otimiza, só limpa (use `cost-optimizer` do `saas-shield-br`)
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

## Combinação com saas-shield-br

Os dois plugins são complementares. Workflow recomendado para releases críticos:

```
/code-health:health        → veredito + plano priorizado
/saas-shield-br:pre-deploy → segurança + RLS + secrets + Vercel config
```

## Licença

MIT
