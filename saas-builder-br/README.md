# saas-builder-br

> Orquestrador central + 8 subagents especializados para construir SaaS multi-tenant em Vite + React + TypeScript / Supabase / Vercel — com gates de segurança plugados no [`saas-shield-br`](../saas-shield-br) e gate de qualidade de código no [`code-health`](../code-health).

## Por que existe

Construir SaaS bem-feito tem ~7 fases (concept → schema → backend → frontend → integrations → security → deploy) e cada fase tem armadilhas próprias. Um agente único tentando dar conta de tudo carrega contexto demais e erra mais. Este plugin separa cada fase em um subagent com escopo curto, ferramentas limitadas e prompt focado — e usa um **arquiteto-chefe** para orquestrar a sequência e disparar gates de segurança nos momentos certos.

Resultado prático: você descreve a ideia em linguagem natural (`/novo-saas <conceito>`), e a sequência de fases roda — pausando só nos gates onde você precisa revisar.

## Arquitetura

```
                       ┌──────────────────────┐
                       │   ARQUITETO-CHEFE    │
                       │  (orquestrador)      │
                       │  Lê/escreve estado   │
                       │  Roteia por fase     │
                       │  Dispara gates       │
                       └──────────┬───────────┘
                                  │ Task tool
        ┌─────────────┬───────────┼───────────┬─────────────┐
        ▼             ▼           ▼           ▼             ▼
 ┌──────────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
 │ arquiteto-   │ │  db-   │ │backend- │ │frontend│ │ design-  │
 │ saas         │ │schema- │ │supabase │ │-react  │ │ ux       │
 │ (concept)    │ │designer│ │(edge fn)│ │(vite)  │ │(tailwind)│
 └──────────────┘ └────────┘ └─────────┘ └────────┘ └──────────┘
                                  │
                       ┌──────────┼──────────┐
                       ▼          ▼          ▼
                ┌────────────┐ ┌──────┐ ┌─────────┐
                │integrador- │ │ qa-  │ │devops-  │
                │apis (LLM,  │ │testes│ │ci       │
                │WhatsApp)   │ │      │ │(Vercel) │
                └────────────┘ └──────┘ └─────────┘

GATES AUTOMÁTICOS:
  Após Fase 2 (schema)         → rls-auditor              [saas-shield-br]
  Após Fase 3 (backend)        → tenant-isolation-auditor       [saas-shield-br]
  Após Fase 5 (integrations)   → secret-hunter            [saas-shield-br]
  Fase 6 (code_health)         → functional-auditor       [code-health]
                                  + dead-code-scanner     [code-health]
  Fase 7 (security_audit)      → 4 shield agents consolidados
  Antes da Fase 8 (deploy)     → vercel-deploy-guard      [saas-shield-br]
```

## Conteúdo

### 1 orquestrador + 8 subagents

| Agent | Fase | O que faz |
|---|---|---|
| **`arquiteto-chefe`** | todas | Orquestra fases, mantém `.claude/saas-state.json`, dispara gates |
| `arquiteto-saas` | 1 — concept | Conceito → spec funcional em `.claude/spec/projeto.md` |
| `db-schema-designer` | 2 — schema | Tabelas Postgres no padrão MarginPro (company_id + FORCE RLS + triggers) |
| `backend-supabase` | 3 — backend | Edge Functions Deno, fluxos de Auth, Storage, Realtime |
| `frontend-react` | 4 — frontend | Vite + React + TS scaffold (router, query, store, forms) |
| `design-ux` | 4 — frontend | Tailwind tokens, Radix primitives, dark mode, a11y WCAG 2.1 AA |
| `integrador-apis` | 5 — integrations | LLMs (OpenAI/Anthropic/Gemini) + WhatsApp (Z-API + Cloud API) |
| `qa-testes` | qualquer | Vitest + Playwright + suite de RLS rodada pelo client SDK |
| `devops-ci` | 7 — deploy | vercel.json, GitHub Actions, secrets categorizados, rollback |

### 5 skills (templates reutilizáveis)

| Skill | O que cobre |
|---|---|
| `vite-react-arquitetura` | Estrutura de pastas canônica + bootstrap em 5 comandos |
| `tanstack-query-supabase` | Query/mutation/optimistic com `company_id` na key |
| `whatsapp-zapi-integracao` | Z-API + Cloud API Meta — schema, webhooks, HMAC, idempotência |
| `llm-multi-provider` | Roteador OpenAI/Anthropic/Gemini com fallback + tracking de custo |
| `responsive-mobile-first` | Checklist Tailwind por tela: drawer mobile, tabela→card, safe-area |

### 3 slash commands

- **`/novo-saas <conceito>`** — inicia projeto novo (Fase 1)
- **`/proximo-passo`** — avalia estado e propõe próximo passo
- **`/quem-faz <tarefa>`** — só roteia (sem executar) — útil pra entender quem cuida do quê

## Como funciona um fluxo típico

```
Você: /novo-saas plataforma de atendimento WhatsApp pra clínicas odonto

→ arquiteto-chefe cria .claude/saas-state.json (phase: concept)
→ delega para arquiteto-saas
→ arquiteto-saas escreve .claude/spec/projeto.md
   (módulos: agendamento, atendimento WA, financeiro)
→ devolve resumo + perguntas pendentes

Você: ok, pode avançar pra Fase 2

→ arquiteto-chefe atualiza state (phase: schema)
→ delega para db-schema-designer
→ db-schema-designer escreve supabase/migrations/...
→ arquiteto-chefe dispara GATE → rls-auditor (saas-shield-br)
   - Se OK: avança
   - Se BLOQUEANTE: devolve para db-schema-designer corrigir

(... e assim por diante até o deploy ...)
```

## Integração com plugins externos

Este plugin **assume que `saas-shield-br` E `code-health` estão instalados**. O arquiteto-chefe chama explicitamente:

| Gate | Quando | Plugin | Agent / Command |
|---|---|---|---|
| Pós-schema | Toda nova migration | saas-shield-br | `rls-auditor` |
| Pós-backend | Edge Functions criadas | saas-shield-br | `tenant-isolation-auditor` |
| Pós-integrações | Antes de commit final | saas-shield-br | `secret-hunter` |
| Fase 6 — Code health | Frontend completo | code-health | `/code-health:audit` + `/code-health:cleanup` |
| Fase 7 — Security | Antes do deploy | saas-shield-br | 4 agents consolidados |
| Pré-deploy | Antes do primeiro deploy | saas-shield-br | `vercel-deploy-guard` (skill) |

**Por que essa divisão**: cada plugin tem foco. `saas-shield-br` cuida de **segurança** (RLS, secrets, multi-tenant). `code-health` cuida de **qualidade funcional** (botão sem handler, rota quebrada, mock em produção, stub esquecido). `saas-builder-br` **constrói** e **orquestra** os outros dois nos momentos certos.

Se um gate de segurança ou de code-health falhar, a fase volta para o subagent responsável corrigir. Você não consegue avançar até passar.

### Findings de code-health não bloqueiam tudo

- **Functional audit** com veredito `NOT_PRODUCTION_READY` → BLOQUEIA o avanço.
- **Functional audit** `NEEDS_WORK` → mostra o relatório, pergunta se quer corrigir antes.
- **Dead-code findings** → não bloqueiam, viram lista opcional de limpeza.

## Princípios não-negociáveis

Cada agent tem seus próprios princípios documentados, mas alguns valem para todos:

- **Frontend nunca chama API externa.** Sempre via Edge Function.
- **Toda tabela tem `company_id`.** RLS + FORCE RLS + trigger force.
- **`company_id` vem do JWT (`app_metadata`).** Nunca do body.
- **Chave de API só em Supabase secrets.** Frontend só vê `VITE_*`.
- **Webhook valida assinatura + dedupe.** Sempre.
- **Mobile-first.** Toda tela funciona em 320px antes de pensar em desktop.

## Stack assumida

Se seu projeto desvia desta stack, alguns subagents vão pedir ajuste. Para mudar, edite o frontmatter do agent + a seção "Stack assumida" do `arquiteto-chefe.md`.

```
Frontend:    Vite + React + TypeScript + Tailwind + React Router v6
             + TanStack Query v5 + React Hook Form + Zod + Zustand
             + Radix UI + lucide-react + cva
Backend:     Supabase (Postgres + Auth + Edge Functions Deno + Storage + Realtime)
Multi-tenant: company_id + FORCE RLS + trigger force_company_id
Tests:       Vitest + Testing Library + MSW + Playwright
Deploy:      Vercel (frontend) + Supabase (DB + edge)
CI:          GitHub Actions
Integrações: OpenAI / Anthropic / Gemini / Z-API / WhatsApp Cloud API
```

## Instalação

Veja [INSTALL.md](./INSTALL.md). Resumo:

```bash
# Plugin (recomendado)
claude plugin marketplace add ../saas-builder-br
claude plugin install saas-builder-br

# OU agents soltos em ~/.claude/agents/
cp -r agents/* ~/.claude/agents/

# OU por projeto
cp -r agents .claude/
cp -r skills .claude/
cp -r commands .claude/
```

## Compatibilidade

- **Claude Code**: 2.x (recomendado 2.1.32+ para hooks de subagent)
- **Sistema operacional**: Windows / macOS / Linux
- **Node**: 20+
- **Supabase CLI**: 1.x

## Estrutura de arquivos

```
saas-builder-br/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── arquiteto-chefe.md           ← orquestrador central
│   ├── arquiteto-saas.md
│   ├── db-schema-designer.md
│   ├── backend-supabase.md
│   ├── frontend-react.md
│   ├── design-ux.md
│   ├── integrador-apis.md
│   ├── qa-testes.md
│   └── devops-ci.md
├── skills/
│   ├── vite-react-arquitetura/SKILL.md
│   ├── tanstack-query-supabase/SKILL.md
│   ├── whatsapp-zapi-integracao/SKILL.md
│   ├── llm-multi-provider/SKILL.md
│   └── responsive-mobile-first/SKILL.md
├── commands/
│   ├── novo-saas.md
│   ├── proximo-passo.md
│   └── quem-faz.md
├── README.md
└── INSTALL.md
```

## Versionamento

`1.0.0` — primeiro release. Veja [CHANGELOG](#changelog) abaixo.

## Changelog

### 1.0.0
- Orquestrador `arquiteto-chefe` + 8 subagents
- 5 skills de patterns reutilizáveis
- 3 slash commands (`/novo-saas`, `/proximo-passo`, `/quem-faz`)
- Integração explícita com `saas-shield-br` para gates de segurança

## Licença

MIT.
