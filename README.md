# claude-plugins (morallesfilms-local)

Marketplace pessoal de plugins Claude Code do Yuri Moraes.

## Plugins inclusos

- **[saas-shield-br](./saas-shield-br/)** — Suite de skills + agents para SaaS multi-tenant em Supabase + Vercel + React/Vite (segurança RLS, isolamento tenant, secrets, custo, PT-BR).
- **[code-health](./code-health/)** — Auditoria e limpeza de código JS/TS/React/Next.js/Vite, Supabase-aware (dead code, botões fantasma, rotas quebradas, mocks, stubs, referências Supabase quebradas).
- **[saas-builder-br](./saas-builder-br/)** — Orquestrador + subagents para construir SaaS multi-tenant (Vite + React + TS / Supabase / Vercel), com gates plugados em saas-shield-br e code-health.
- **[turbo](./turbo/)** — Otimização de performance ponta a ponta (React/Next + Postgres/Supabase), com baseline medido e guarda-corpos contra regressão.
- **[saas-audit-br](./saas-audit-br/)** — Orquestrador de auditoria completa de SaaS (audit → fix → test), reutilizando saas-shield-br + code-health.

## saas-audit-br — orquestrador de auditoria

Orquestrador de auditoria completa de SaaS. **Não substitui** `saas-shield-br` nem `code-health`: coordena os dois e cobre o que nenhum deles cobre.

| Plugin | Papel |
|---|---|
| `saas-shield-br` | **Especialistas de segurança** — RLS, isolamento de tenant, identidade/RBAC, secrets, migrations, integrações, Edge Functions, deploy |
| `code-health` | **Qualidade funcional/código** — dead code, botões fantasma, rotas quebradas, mocks, stubs, referências Supabase quebradas |
| `saas-audit-br` | **Orquestrador audit → fix → test** — fases, estado em disco, classificação P0–P3, correção, regressão, processo/negócio, IA/automações, resiliência de dados, relatório consolidado |

Fluxo:

```text
BASELINE → RECONHECIMENTO → MAPA DO SISTEMA → TENANCY PROFILE
  → SEGURANÇA ESPECIALIZADA (saas-shield-br) → CODE HEALTH (code-health)
  → RISCOS COMPLEMENTARES (processo · IA · dados)
  → CLASSIFICAÇÃO P0/P1/P2/P3 → PLANO
  → CORREÇÃO P0 → TESTE → CORREÇÃO P1 → TESTE → CORREÇÃO P2
  → HARDENING → REGRESSÃO → RELATÓRIO FINAL
```

Uso:

```text
/saas-audit-br:audit                  # auditoria completa (modo padrão: --fix)
/saas-audit-br:audit --audit-only     # audita, classifica e planeja — não edita código
/saas-audit-br:audit --fix            # audita e corrige P0/P1/P2 com testes
/saas-audit-br:audit --full           # --fix + varredura aprofundada, hardening P3 e regressão ampliada
/saas-audit-br:module Financeiro      # auditoria focada em um módulo
/saas-audit-br:module Agenda --fix
/saas-audit-br:resume                 # retoma do estado em disco (após compactação ou nova sessão)
/saas-audit-br:status                 # só mostra fase, P0–P3, bloqueantes e próxima ação
```

- **Dependências**: instale junto `saas-shield-br` e `code-health` (o setup automático já faz isso). Sem eles a auditoria continua, mas a cobertura correspondente fica `INCONCLUSIVE`.
- **Tenancy**: resolvido pela skill `tenant-model` do saas-shield-br (4 arquétipos) — não assume `company_id`.
- **Estado**: `.saas-audit/` no projeto auditado (`STATE.md`, `ARCHITECTURE.md`, `FINDINGS.md`, `PLAN.md`, `TESTS.md`, `REPORT.md`, `modules/`). Subagents fazem a varredura pesada; o thread principal recebe só resumo, evidência, severidade e próximo passo.
- **Segurança operacional**: nunca executa automaticamente `git reset --hard`, `git clean -fd`, force push, DROP/purge/restore em produção, rotação de secrets ou alteração massiva irreversível de dados — esses casos viram plano + backup + rollback/roll-forward + passo manual + validação.

Detalhes em [saas-audit-br/README.md](./saas-audit-br/README.md).

## Instalar em qualquer máquina

### Setup automático (recomendado)

Roda 1 comando e o script faz tudo: registra marketplaces oficiais Anthropic, clona seu marketplace pessoal, instala os 7 plugins do dia-a-dia (saas-shield-br + code-health + saas-audit-br + canvas-design + frontend-design + skill-creator + mcp-builder).

**Windows (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.sh | bash
```

> Pré-requisitos: Claude Code + git instalados e no PATH.

### Setup manual

```bash
# 1. Clone este repo onde preferir
git clone https://github.com/moralles-filmes/claude-plugins.git ~/Documents/claude-plugins

# 2. Registra como marketplace no Claude Code
claude plugin marketplace add ~/Documents/claude-plugins

# 3. Instala o plugin desejado
claude plugin install saas-shield-br
```

Para instalar **todos** os plugins deste marketplace a partir do repo clonado: `.\install-all.ps1` (Windows) ou `./install-all.sh` (macOS/Linux).

## Atualizar

```bash
cd ~/claude-plugins
git pull

# Recarrega no Claude Code
claude plugin update saas-shield-br
```

## Adicionar um plugin novo

1. Crie a pasta `<nome-do-plugin>/` na raiz com a estrutura do plugin (`.claude-plugin/plugin.json`, `skills/`, `agents/`, etc.)
2. Adicione uma entrada em `.claude-plugin/marketplace.json`:
   ```json
   {
     "name": "<nome-do-plugin>",
     "source": "./<nome-do-plugin>",
     "description": "..."
   }
   ```
3. Commit + push.
4. Em qualquer máquina: `git pull && claude plugin install <nome-do-plugin>`

## Estrutura

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json     # lista de plugins
├── .github/workflows/
│   └── validate.yml         # CI: valida JSON, frontmatter, scripts
├── scripts/
│   └── validate.mjs         # rodável local também
├── saas-shield-br/          # plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/, agents/, commands/, hooks/
│   └── README.md
├── setup-claude.ps1         # bootstrap Windows
├── setup-claude.sh          # bootstrap macOS/Linux
└── README.md                # este arquivo
```

## Validação local antes de push

Antes de fazer `git push`, rode pra pegar erros na hora:

```bash
node scripts/validate.mjs
```

Mesmo script roda no CI a cada push (`.github/workflows/validate.yml`).

### Pre-push hook automático

Pra a validação rodar automaticamente antes de **todo** `git push`:

**Windows (PowerShell):**
```powershell
.\scripts\install-hooks.ps1
```

**macOS / Linux:**
```bash
chmod +x scripts/install-hooks.sh
./scripts/install-hooks.sh
```

Isso configura `core.hooksPath = .githooks` neste repo. Push só acontece se `validate.mjs` passar. Pra pular numa emergência: `git push --no-verify`.

> **Nota**: `setup-claude.ps1` / `setup-claude.sh` já fazem isso automaticamente quando clonam o repo numa máquina nova.
