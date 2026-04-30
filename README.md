# claude-plugins (morallesfilms-local)

Marketplace pessoal de plugins Claude Code do Yuri Moraes.

## Plugins inclusos

- **[saas-shield-br](./saas-shield-br/)** — Suite de skills + agents para SaaS multi-tenant em Supabase + Vercel + React/Vite (segurança RLS, isolamento tenant, secrets, custo, PT-BR).

## Instalar em qualquer máquina

### Setup automático (recomendado)

Roda 1 comando e o script faz tudo: registra marketplaces oficiais Anthropic, clona seu marketplace pessoal, instala os 5 plugins do dia-a-dia (saas-shield-br + canvas-design + frontend-design + skill-creator + mcp-builder).

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
