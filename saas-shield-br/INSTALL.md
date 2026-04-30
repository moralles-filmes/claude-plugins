# Instalação do saas-shield-br

## Opção A — Plugin global no Claude Code (Recomendado)

Funciona em qualquer projeto que você abrir.

### 1. Coloque a pasta num lugar permanente

Já está em `C:\Users\morae\Documents\claude-plugins\saas-shield-br` — pode deixar aí ou mover.

### 2. Adicione como marketplace local

Edite `~/.claude/settings.json` (ou crie):

```json
{
  "plugins": {
    "marketplaces": [
      {
        "name": "local",
        "type": "local",
        "path": "C:/Users/morae/Documents/claude-plugins"
      }
    ]
  }
}
```

### 3. Instale via comando

```bash
claude plugin install saas-shield-br
```

### 4. Verifique

Numa sessão Claude Code, digite:
```
/audit-tenant
```

Se o command aparecer no autocomplete, está instalado.

---

## Opção B — Skills soltas em `~/.claude/skills/`

Funciona em **qualquer** cliente Claude (Code, Cowork, API com skills).

### Windows (PowerShell)

```powershell
$claudeDir = "$env:USERPROFILE\.claude"
$source = "$env:USERPROFILE\Documents\claude-plugins\saas-shield-br"
New-Item -ItemType Directory -Force -Path "$claudeDir\skills","$claudeDir\agents","$claudeDir\commands" | Out-Null
Copy-Item -Recurse "$source\skills\*" "$claudeDir\skills\"
Copy-Item -Recurse "$source\agents\*" "$claudeDir\agents\"
Copy-Item -Recurse "$source\commands\*" "$claudeDir\commands\"
```

### Linux / macOS

```bash
mkdir -p ~/.claude/skills ~/.claude/agents ~/.claude/commands
cp -r ~/Documents/claude-plugins/saas-shield-br/skills/* ~/.claude/skills/
cp -r ~/Documents/claude-plugins/saas-shield-br/agents/* ~/.claude/agents/
cp -r ~/Documents/claude-plugins/saas-shield-br/commands/* ~/.claude/commands/
```

### Verificação

Abra um SaaS seu, peça ao Claude:
> "Audita o RLS dessa migration aqui"

Ele deve carregar o `rls-reviewer` automaticamente.

---

## Opção C — Por projeto (`.claude/` no repo)

Útil se o time inteiro deve ter as mesmas skills.

```powershell
cd C:\caminho\para\seu-projeto
New-Item -ItemType Directory -Force -Path .\.claude | Out-Null
Copy-Item -Recurse "$env:USERPROFILE\Documents\claude-plugins\saas-shield-br\skills"   .\.claude\
Copy-Item -Recurse "$env:USERPROFILE\Documents\claude-plugins\saas-shield-br\agents"   .\.claude\
Copy-Item -Recurse "$env:USERPROFILE\Documents\claude-plugins\saas-shield-br\commands" .\.claude\
git add .claude
git commit -m "feat: adiciona saas-shield-br skills"
```

Cada dev que clonar o repo terá as skills automaticamente.

---

## Verificando hooks

Os hooks só ativam quando o plugin está instalado como **plugin global** (Opção A) — porque dependem de `${CLAUDE_PLUGIN_ROOT}`.

Se você usa Opção B/C e quer hooks, copie manualmente para `~/.claude/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node C:/Users/morae/Documents/claude-plugins/saas-shield-br/hooks/scripts/check-sql-antipattern.mjs"
        }]
      }
    ]
  }
}
```

(Substitua `${CLAUDE_PLUGIN_ROOT}` pelo path absoluto.)

---

## Dependências

Os hooks exigem **Node.js 18+** disponível no PATH. Se você usa Bun ou Deno como principal mas tem Node instalado para tooling, está tudo certo.

Verifique:
```bash
node --version  # >= 18.0.0
```

Se não tiver, instale Node.js (recomendado via [fnm](https://github.com/Schniz/fnm) ou [Volta](https://volta.sh)).

---

## Atualização

Quando uma nova versão sair, repita o passo de cópia/install. As skills sobrescrevem a versão antiga.

Para Opção A (plugin):
```bash
claude plugin update saas-shield-br
```

---

## Desinstalação

### Plugin global
```bash
claude plugin uninstall saas-shield-br
```

### Skills soltas (Windows)
```powershell
$claudeDir = "$env:USERPROFILE\.claude"
@('rls-reviewer','multi-tenant-auditor','secret-scanner','supabase-migrator','edge-function-guard','cost-optimizer','schema-diff','vercel-deploy-guard','pt-br-translator','token-budget-analyst') | ForEach-Object {
  Remove-Item -Recurse -Force "$claudeDir\skills\$_" -ErrorAction SilentlyContinue
}
@('rls-auditor','tenant-leak-hunter','secret-hunter','migration-validator') | ForEach-Object {
  Remove-Item -Force "$claudeDir\agents\$_.md" -ErrorAction SilentlyContinue
}
@('audit-tenant','check-rls','secret-scan','pre-deploy','new-migration') | ForEach-Object {
  Remove-Item -Force "$claudeDir\commands\$_.md" -ErrorAction SilentlyContinue
}
```

---

## Troubleshooting

**Skill não dispara automaticamente**
- Confira que `description:` no SKILL.md tem palavras-chave que o usuário usa
- Tente invocar explicitamente: "Use a skill rls-reviewer e audita esse arquivo"

**Hook não roda**
- Confira `node --version >= 18`
- Confira que `${CLAUDE_PLUGIN_ROOT}` foi resolvido (em Opção A é automático)
- Veja logs em `~/.claude/logs/`

**Subagent retorna vazio**
- Subagents só funcionam em Claude Code via Task tool ou em ambientes com agentic SDK
- Em Cowork, são equivalentes a "delegar tarefa em isolamento"
