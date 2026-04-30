# claude-plugins (morallesfilms-local)

Marketplace pessoal de plugins Claude Code do Yuri Moraes.

## Plugins inclusos

- **[saas-shield-br](./saas-shield-br/)** — Suite de skills + agents para SaaS multi-tenant em Supabase + Vercel + React/Vite (segurança RLS, isolamento tenant, secrets, custo, PT-BR).

## Instalar em qualquer máquina

```bash
# 1. Clone este repo onde preferir
git clone <URL-DO-REPO> ~/claude-plugins

# 2. Registra como marketplace no Claude Code
claude plugin marketplace add ~/claude-plugins

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
├── saas-shield-br/          # plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/, agents/, commands/, hooks/
│   └── README.md
└── README.md                # este arquivo
```
