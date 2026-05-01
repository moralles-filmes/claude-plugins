# Instalação — saas-builder-br

Você tem 3 opções. **Recomendamos a Opção A** (plugin global).

## Opção A — Plugin global (recomendado)

Funciona em qualquer projeto, sem mexer no repo. Agents ficam disponíveis em todas as sessões do Claude Code.

```bash
# 1. Adiciona o marketplace local (uma vez só, aponta pra pasta pai)
claude plugin marketplace add C:\Users\morae\Documents\claude-plugins

# 2. Instala
claude plugin install saas-builder-br

# 3. (recomendado) instala também o saas-shield-br se ainda não estiver
claude plugin install saas-shield-br
```

Verifique:
```bash
claude plugin list
# deve mostrar saas-builder-br e saas-shield-br
```

## Opção B — Agents soltos em `~/.claude/agents/`

Mais leve, mas você precisa copiar manualmente quando atualizar.

### Linux/macOS
```bash
mkdir -p ~/.claude/agents ~/.claude/skills ~/.claude/commands
cp -r agents/* ~/.claude/agents/
cp -r skills/* ~/.claude/skills/
cp -r commands/* ~/.claude/commands/
```

### Windows (PowerShell)
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\agents" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\commands" | Out-Null
Copy-Item -Recurse -Force agents\* "$env:USERPROFILE\.claude\agents\"
Copy-Item -Recurse -Force skills\* "$env:USERPROFILE\.claude\skills\"
Copy-Item -Recurse -Force commands\* "$env:USERPROFILE\.claude\commands\"
```

## Opção C — Por projeto (`.claude/` no repo)

Útil quando você quer versionar os agents junto com o projeto, ou customizar para o cliente específico.

```bash
cd /caminho/do/seu/projeto
mkdir -p .claude/agents .claude/skills .claude/commands
cp -r /caminho/saas-builder-br/agents/* .claude/agents/
cp -r /caminho/saas-builder-br/skills/* .claude/skills/
cp -r /caminho/saas-builder-br/commands/* .claude/commands/

# Commit
git add .claude/
git commit -m "chore: install saas-builder-br agents"
```

## Verificando que funcionou

Abra Claude Code dentro de um projeto e digite:

```
/quem-faz quero criar uma tabela de invoices
```

Esperado: a resposta cita `db-schema-designer` como agent responsável.

Ou:

```
@arquiteto-chefe oi, você está disponível?
```

Esperado: o orquestrador responde se apresentando como arquiteto-chefe.

## Atualizando

### Plugin (Opção A)
```bash
cd C:\Users\morae\Documents\claude-plugins\saas-builder-br
git pull  # ou puxe sua versão atualizada
claude plugin update saas-builder-br
```

### Agents soltos (B/C)
Recopie os arquivos da pasta de origem.

## Removendo

```bash
# Plugin
claude plugin uninstall saas-builder-br

# Agents soltos (Linux/macOS)
rm ~/.claude/agents/{arquiteto-chefe,arquiteto-saas,db-schema-designer,backend-supabase,frontend-react,design-ux,integrador-apis,qa-testes,devops-ci}.md
rm -rf ~/.claude/skills/{vite-react-arquitetura,tanstack-query-supabase,whatsapp-zapi-integracao,llm-multi-provider,responsive-mobile-first}
rm ~/.claude/commands/{novo-saas,proximo-passo,quem-faz}.md

# Agents soltos (Windows PowerShell)
"arquiteto-chefe","arquiteto-saas","db-schema-designer","backend-supabase","frontend-react","design-ux","integrador-apis","qa-testes","devops-ci" | ForEach-Object { Remove-Item "$env:USERPROFILE\.claude\agents\$_.md" -ErrorAction SilentlyContinue }
"vite-react-arquitetura","tanstack-query-supabase","whatsapp-zapi-integracao","llm-multi-provider","responsive-mobile-first" | ForEach-Object { Remove-Item -Recurse "$env:USERPROFILE\.claude\skills\$_" -ErrorAction SilentlyContinue }
"novo-saas","proximo-passo","quem-faz" | ForEach-Object { Remove-Item "$env:USERPROFILE\.claude\commands\$_.md" -ErrorAction SilentlyContinue }
```

## Solução de problemas

### "Agent X not found"
Confirme que o arquivo existe em `~/.claude/agents/X.md` (Opção B/C) ou que `claude plugin list` mostra o plugin habilitado (Opção A).

### "Subagent não recebe a Task"
Verifique se o `arquiteto-chefe` está usando `Task` tool no `tools:` do frontmatter — sem `Task` ele não consegue delegar.

### "Não acha .claude/saas-state.json"
Esperado no primeiro uso. Use `/novo-saas <conceito>` que ele cria.

### Comandos `/novo-saas` etc não aparecem
O Claude Code precisa indexar de novo. Reabra a sessão.
