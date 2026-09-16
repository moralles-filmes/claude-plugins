# claude-plugins (morallesfilms-local)

Marketplace pessoal de plugins Claude Code do Yuri Moraes.

## Plugins inclusos

- **[saas-shield-br](./saas-shield-br/)** — Suite de skills + agents para SaaS multi-tenant em Supabase + Vercel + React/Vite (segurança RLS, isolamento tenant, secrets, custo, PT-BR).
- **[code-health](./code-health/)** — Auditoria e limpeza de código JS/TS/React/Next.js/Vite, Supabase-aware (dead code, botões fantasma, rotas quebradas, mocks, stubs, referências Supabase quebradas).
- **[saas-builder-br](./saas-builder-br/)** — Orquestrador + subagents para construir SaaS multi-tenant (Vite + React + TS / Supabase / Vercel), com gates plugados em saas-shield-br e code-health.
- **[turbo](./turbo/)** — Otimização de performance ponta a ponta (React/Next + Postgres/Supabase), com baseline medido e guarda-corpos contra regressão.
- **[saas-audit-br](./saas-audit-br/)** — Orquestrador de auditoria completa de SaaS (audit → fix → test), reutilizando saas-shield-br + code-health.
- **[ai-router-br](./ai-router-br/)** — Roteamento seguro de tarefas por risco/custo entre o agente principal, Codex worker (login ChatGPT) e DeepSeek worker (API). Versão nativa Codex em [codex/ai-router-br](./codex/ai-router-br/).

## Instalando em uma máquina nova

Este repositório é a fonte oficial para reconstruir o ambiente inteiro (Claude Code + Codex + plugins).

**Windows (PowerShell):**
```powershell
git clone https://github.com/moralles-filmes/claude-plugins.git
cd claude-plugins
.\setup-claude.ps1
```
> Se a política de execução bloquear: `powershell -ExecutionPolicy Bypass -File .\setup-claude.ps1`

**macOS / Linux:**
```bash
git clone https://github.com/moralles-filmes/claude-plugins.git
cd claude-plugins
./setup-claude.sh
```

O setup, de forma idempotente:

1. verifica Git e Node.js 20+;
2. verifica Claude Code e Codex CLI — se faltarem, instala pelos instaladores oficiais (`irm https://claude.ai/install.ps1 | iex` e `irm https://chatgpt.com/codex/install.ps1 | iex`; no macOS/Linux, os equivalentes `install.sh`);
3. confere o login do Claude (assinatura) e se o Codex está autenticado **via ChatGPT** — nunca troca login por API key; se precisar, pede só o `codex login` interativo;
4. registra/atualiza os marketplaces e instala/atualiza **todos** os plugins deste repositório (lidos de `.claude-plugin/marketplace.json`, inclui `ai-router-br`) + `frontend-design`, `skill-creator` e `superpowers`;
5. instala a versão nativa Codex do `ai-router-br` (`.agents/plugins/marketplace.json`) e coloca o bloco curto do router no `AGENTS.md` global do Codex;
6. valida os plugins, roda os testes essenciais e o doctor;
7. verifica apenas se `DEEPSEEK_API_KEY` **existe** (nunca mostra o valor). Se faltar, configure-a localmente nas variáveis de ambiente do usuário ou no seu gerenciador de secrets — **nunca cole a chave em chat, Git, CLAUDE.md, AGENTS.md ou `.ai-router/`**. Sem ela tudo funciona com Claude + Codex.

Rode o mesmo comando no futuro para atualizar: ele faz só `git pull --ff-only` (e pula se houver mudanças locais), nunca usa comandos Git destrutivos e não mexe em secrets. Opções: `-CheckOnly` (só verifica, não altera nada), `-NoInstall`, `-NoPull`, `-SkipCodex`, `-SkipExtras`, `-SkipTests`, `-LocalMarketplace` (no `.sh`: `--check-only`, `--no-install`, ...).

## Usando em um projeto novo

Depois da instalação global não há nada para configurar por projeto: abra o projeto no **Claude Code** ou no **Codex** e faça seu pedido normalmente, sem mencionar o router.

- Para trabalho substancial, o agente principal aciona o `ai-router-br` (Claude: `ai-router-br:route`, via hook de início de sessão; Codex: skill `$ai-router`).
- No primeiro uso em cada projeto o router **se auto-inicializa** em silêncio: cria `.ai-router/` (config, estado, tarefas, resultados), adiciona `.ai-router/` ao `.git/info/exclude` local e acrescenta um bloco curto e idêntico em `CLAUDE.md` e `AGENTS.md`, preservando o conteúdo existente. Rodar de novo não duplica nada.
- Tarefas críticas (auth, RLS, tenancy, pagamentos, produção) ficam com o agente principal; coding vai de preferência para o Codex worker; volume/mecânico para o DeepSeek. Nenhum resultado de worker é integrado sem revisão, e os testes do trabalho delegado rodam na sua árvore depois dessa revisão.
- Os workers precisam de Git: numa pasta sem repositório o router só classifica e não cria nada. `.ai-router/` é sempre local — nunca faça commit dessa pasta.
- Faça commit do bloco em `CLAUDE.md`/`AGENTS.md` quando quiser; enquanto isso ele não bloqueia os workers (o router reconhece que a mudança é só dele).

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

Veja [Instalando em uma máquina nova](#instalando-em-uma-máquina-nova). Sem clonar antes, o mesmo script também funciona remoto (clona em `~/Documents/claude-plugins`):

```powershell
iwr -useb https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.ps1 | iex
```
```bash
curl -fsSL https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.sh | bash
```

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
│   └── marketplace.json     # lista de plugins Claude Code
├── .agents/plugins/
│   └── marketplace.json     # marketplace Codex (ai-router-br nativo)
├── .github/workflows/
│   └── validate.yml         # CI: valida JSON, frontmatter, scripts + testes do ai-router-br
├── scripts/
│   └── validate.mjs         # rodável local também (Claude + Codex + sincronia do ai-router-br)
├── saas-shield-br/          # plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/, agents/, commands/, hooks/
│   └── README.md
├── ai-router-br/            # plugin Claude Code (núcleo compartilhado + skills/hook Claude)
├── codex/
│   └── ai-router-br/        # plugin Codex nativo (.codex-plugin/, skills com agents/openai.yaml)
├── setup-claude.ps1         # bootstrap/atualização Windows
├── setup-claude.sh          # bootstrap/atualização macOS/Linux
└── README.md                # este arquivo
```

O núcleo do ai-router-br (`lib/`, `workers/`, `scripts/`, `tests/`, `templates/`, `references/`) é idêntico em `ai-router-br/` e `codex/ai-router-br/`; `scripts/validate.mjs` falha se as cópias divergirem.

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
