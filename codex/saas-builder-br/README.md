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
                                  │ Agent tool
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
  Fase 6 (code_health)         → /saas-audit-br:audit --audit-only  [saas-audit-br]
                                  (code-health + saas-shield-br + processo/dados/IA)
  Fase 7 (security_audit)      → confirmação no REPORT após correções  [saas-audit-br]
  Antes da Fase 8 (deploy)     → vercel-deploy-guard      [saas-shield-br]
```

## Conteúdo

### 1 orquestrador + 8 subagents

| Agent | Fase | O que faz |
|---|---|---|
| **`arquiteto-chefe`** | todas | Orquestra fases, mantém `.claude/saas-state.json`, dispara gates |
| `arquiteto-saas` | 1 — concept | Conceito → spec funcional em `.claude/spec/projeto.md` |
| `db-schema-designer` | 2 — schema | Tabelas da empresa/filial, catálogo de permissões, RPCs e pgTAP — SQL pela skill `saas-shield-br:supabase-migrator` e templates do `padrao-saas` |
| `backend-supabase` | 3 — backend | Casos de uso em Edge Function/RPC (ARCHITECTURE §5), provisionamento, Storage, Realtime |
| `frontend-react` | 4 — frontend | Vite + React + TS scaffold (router, query, store, forms) |
| `design-ux` | 4 — frontend | Tailwind tokens, Radix primitives, dark mode, a11y WCAG 2.1 AA |
| `integrador-apis` | 5 — integrations | LLMs (OpenAI/Anthropic/Gemini) + WhatsApp (Z-API + Cloud API) |
| `qa-testes` | qualquer | Vitest + Playwright + pgTAP; mesmo usuário em duas empresas, filial, submódulo, ação |
| `devops-ci` | 8 — deploy | CI no PR com banco local, deploy em Environment protegido, secrets categorizados, rollback |

### 5 skills (templates reutilizáveis)

| Skill | O que cobre |
|---|---|
| `vite-react-arquitetura` | Estrutura de pastas, arquivos críticos (client, env, providers, router com `/app/:empresa`) + bootstrap em 5 comandos |
| `tanstack-query-supabase` | `useActiveCompany`, adapter `api.ts`, filtro por empresa/filial, keys pelo `companyId`, RPC em transição crítica |
| `whatsapp-zapi-integracao` | Z-API + Cloud API Meta — conexão com tokens no Vault, webhooks, HMAC, idempotência |
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

Este plugin **assume que `saas-shield-br`, `code-health` e `saas-audit-br` estão instalados**. O arquiteto-chefe usa:

| Gate | Quando | Plugin | Agent / Command |
|---|---|---|---|
| Pós-schema | Toda nova migration | saas-shield-br | `rls-auditor` |
| Pós-backend | Edge Functions criadas | saas-shield-br | `tenant-isolation-auditor` |
| Pós-integrações | Antes de commit final | saas-shield-br | `secret-hunter` |
| Fase 6 — Auditoria | Frontend + integrações completos | saas-audit-br | `/saas-audit-br:audit --audit-only` (você roda) |
| Fase 7 — Confirmação | Após as correções | saas-audit-br | `REPORT.md` sem P0/P1 em aberto |
| Pré-deploy | Antes do primeiro deploy | saas-shield-br | `vercel-deploy-guard` (skill) |

**Por que essa divisão**: cada plugin tem foco. `saas-shield-br` cuida de **segurança** (RLS, secrets, multi-tenant). `code-health` cuida de **qualidade funcional** (botão sem handler, rota quebrada, mock em produção, stub esquecido). `saas-audit-br` **orquestra a auditoria completa** (os dois anteriores + processo, dados e IA, deduplicados por causa raiz). `saas-builder-br` **constrói** e dispara os gates pontuais; a auditoria completa fica num lugar só, sem lista duplicada de auditores.

Se um gate ou a auditoria encontrar bloqueante (P0/P1), a fase volta para o subagent responsável corrigir. Você não consegue avançar até passar.

### Findings de code-health não bloqueiam tudo

- **Functional audit** com veredito `NOT_PRODUCTION_READY` → BLOQUEIA o avanço.
- **Functional audit** `NEEDS_WORK` → mostra o relatório, pergunta se quer corrigir antes.
- **Dead-code findings** → não bloqueiam, viram lista opcional de limpeza.

## Princípios não-negociáveis

Cada agent tem seus próprios princípios documentados, mas alguns valem para todos:

- **Frontend nunca chama API externa.** Sempre via Edge Function.
- **Projeto novo segue o Padrão SaaS, arquétipo E**: `company_id` (+ `location_id` na tabela da filial), FK composta, FORCE RLS com `private.allowed_company_ids`/`allowed_location_ids`. Projeto existente mantém o arquétipo do profile.
- **A empresa ativa vem da URL e o servidor confirma a membership.** Nunca do body nem de claim do JWT. Toda query de tela filtra pela empresa ativa; toda query key começa pelo `companyId`.
- **A tela chama `src/features/<modulo>/api.ts`**, único arquivo do módulo que fala com o Supabase. Transição crítica vai por RPC ou Edge Function.
- **Chave da plataforma em Supabase secrets; token de cada cliente no Vault.** Frontend só vê `VITE_*`.
- **Webhook valida assinatura + dedupe.** Sempre.
- **Mobile-first.** Toda tela funciona em 320px antes de pensar em desktop.

## Stack assumida

Se seu projeto desvia desta stack, alguns subagents vão pedir ajuste. Para mudar, edite o frontmatter do agent + a seção "Stack assumida" do `arquiteto-chefe.md`.

```
Frontend:    Vite + React + TypeScript + Tailwind + React Router v6
             + TanStack Query v5 + React Hook Form + Zod + Zustand
             + Radix UI + lucide-react + cva
Backend:     Supabase (Postgres + Auth + Edge Functions Deno + Storage + Realtime)
Multi-tenant: Padrão SaaS, arquétipo E (empresa → filial, permissões <modulo>.<submodulo>.<acao>);
             projeto existente: arquétipo A–D declarado no .claude/tenancy-profile.yml
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
├── CHANGELOG.md
└── INSTALL.md
```

## Versionamento

Versão atual: **1.5.0**. Histórico completo em [CHANGELOG.md](./CHANGELOG.md).

### O que mudou na 1.5.0

- Projeto novo nasce no arquétipo E do Padrão SaaS em todos os agentes; A–D só para projeto existente.
- Frontend: empresa ativa na URL, adapter `api.ts` por módulo, filtro por empresa/filial em toda query, chaves pelo `companyId`, transição crítica por RPC.
- Sem cópias divergentes: SQL pelo `saas-shield-br:supabase-migrator`, Edge Function pelo `edge-function-guard`, `vercel.json` pelo `vercel-deploy-guard`.
- CI com banco local e pgTAP no PR; produção só com aprovação manual num Environment protegido.
- Tokens de WhatsApp de cada cliente no Supabase Vault.

## Licença

MIT.
