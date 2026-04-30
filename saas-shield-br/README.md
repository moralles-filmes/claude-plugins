# saas-shield-br

> Plugin Claude Code para devs brasileiros que constroem SaaS multi-tenant em Supabase + Vercel + React/Vite. Foco em **segurança extrema** (RLS, isolamento de tenant, secrets), **economia de custo** (queries, índices, bundle) e **padrões PT-BR**.

## O que está dentro

### 10 Skills

| Skill | Categoria | O que faz |
|---|---|---|
| `rls-reviewer` | Segurança | Audita policies RLS — `FORCE RLS`, `USING` vs `WITH CHECK`, `SECURITY DEFINER` + `search_path`, anti-patterns |
| `multi-tenant-auditor` | Segurança | Auditoria profunda de isolamento — `company_id NOT NULL`, triggers `*_force_company_id`, resolver canônico, leak detection |
| `secret-scanner` | Segurança | Detecta secrets vazados — `service_role` em cliente, `.env` commitado, JWT/keys hardcoded, `VITE_` abuse |
| `supabase-migrator` | Backend | Gera migrations no padrão MarginPro — timestamp, idempotência, FORCE RLS, triggers, policies |
| `edge-function-guard` | Backend | Revisa Edge Functions — JWT validation, CORS, error leakage, rate limiting, auth header forwarding |
| `cost-optimizer` | Performance | Reduz custo Supabase/Vercel — índices RLS-aware, STABLE caching, N+1, realtime caro, bundle size |
| `schema-diff` | DevOps | Drift entre migrations locais ↔ remoto — tabelas sem RLS, sem trigger, sem índice |
| `vercel-deploy-guard` | DevOps | Pré-deploy — env vars, headers de segurança (CSP/HSTS), source maps, bundle limit |
| `pt-br-translator` | UX | Revisa UI strings PT-BR — gênero, formalidade, idiomáticos comuns, formato BR de data/número |
| `token-budget-analyst` | Workflow | Otimiza prompts/contexto Claude — pruning, cache, tool description size |

### 4 Subagents

| Agent | Quando usar |
|---|---|
| `rls-auditor` | Auditoria isolada e profunda de RLS num PR ou migration |
| `tenant-leak-hunter` | Caça vazamentos cross-tenant — JOINs sem filtro, views, edge functions com `service_role` |
| `secret-hunter` | Varredura completa do repo + histórico git por secrets |
| `migration-validator` | Valida migration proposta antes de aplicar (dry-run + checklist) |

### 5 Slash Commands

- `/audit-tenant` — roda multi-tenant-auditor no projeto inteiro
- `/check-rls [arquivo]` — revisa RLS num arquivo específico ou em todas migrations recentes
- `/secret-scan` — scan completo de secrets (incluindo histórico git)
- `/pre-deploy` — checklist completo antes de fazer deploy (Vercel + Supabase)
- `/new-migration [descrição]` — gera nova migration no seu padrão

### 2 Hooks

- **PreToolUse** em `Write|Edit` para `*.sql` — roda rls-reviewer automaticamente
- **PreToolUse** em `Bash` quando comando é `git commit` — roda secret-scanner antes de permitir

## Instalação

### Opção A: Plugin global (recomendado)

```bash
# 1. Adiciona o marketplace local (uma vez)
claude plugin marketplace add /caminho/para/saas-shield-br

# 2. Instala o plugin
claude plugin install saas-shield-br
```

### Opção B: Skills soltas em `~/.claude/skills/`

```bash
# Linux/macOS
cp -r saas-shield-br/skills/* ~/.claude/skills/

# Windows (PowerShell)
Copy-Item -Recurse saas-shield-br\skills\* $env:USERPROFILE\.claude\skills\
```

### Opção C: Por projeto (`.claude/skills/` no repo)

```bash
mkdir -p .claude
cp -r saas-shield-br/skills .claude/
cp -r saas-shield-br/agents .claude/
cp -r saas-shield-br/commands .claude/
```

## Como o plugin pensa sobre segurança

Toda skill de segurança parte do princípio **"nunca confie no cliente"** e segue o modelo de defesa em três camadas que o `rls-reviewer` e `multi-tenant-auditor` validam:

1. **Coluna `company_id NOT NULL`** em toda tabela de domínio, com FK para `public.companies(id)`.
2. **Resolver canônico `get_current_company_id()`** — `STABLE SECURITY DEFINER`, `SET search_path = public`, lê `auth.uid() → profiles.company_id`.
3. **Triggers `*_force_company_id`** — sobrescrevem `NEW.company_id` em INSERT/UPDATE para defender contra cliente malicioso. Imutável em UPDATE.
4. **`FORCE RLS` + policies `USING + WITH CHECK`** em toda tabela.

Toda skill nesse plugin verifica essas 4 camadas e rejeita migrations/queries que violem qualquer uma delas.

## Filosofia

- **Falha cedo, falha alto.** Um leak cross-tenant é incidente de segurança, não warning. As skills são treinadas a marcar como bloqueante.
- **Performance é parte da segurança.** RLS sem índice em `company_id` é DoS esperando acontecer. `cost-optimizer` cobre isso.
- **PT-BR como cidadão de primeira classe.** Skills, agents e commands escrevem outputs em português — porque sua UI também é.
- **Token economy embutida.** O `token-budget-analyst` audita seu workflow e o plugin foi escrito com prompts curtos e referências `reference.md` carregadas sob demanda.

## Estrutura de arquivos

```
saas-shield-br/
├── .claude-plugin/
│   └── plugin.json          # manifesto
├── skills/                  # 10 skills (cada uma com SKILL.md + reference.md)
├── agents/                  # 4 subagents (markdown com frontmatter)
├── commands/                # 5 slash commands
├── hooks/
│   └── hooks.json           # 2 hooks
├── README.md                # este arquivo
└── CHANGELOG.md
```

## Versionamento

Versão atual: **1.0.0** — ver [CHANGELOG.md](./CHANGELOG.md).

## Licença

MIT.
