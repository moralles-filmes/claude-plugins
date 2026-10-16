# Instalação

Pré-requisitos: Node.js 20+, Git, agente principal autenticado pelo plano, Codex CLI autenticado via ChatGPT e `DEEPSEEK_API_KEY` local somente se DeepSeek for usado.

A chave do DeepSeek precisa ser o texto real (`sk-...`), sem espaços. No Windows, copie a chave e grave direto da área de transferência — assim nenhuma tecla vira texto (um Ctrl+V que não cola fica salvo como o caractere 22 e o DeepSeek falha sempre):

```powershell
[Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', (Get-Clipboard).Trim(), 'User')
```

Depois feche e reabra o editor (o Claude Code lê o ambiente ao iniciar) e confira com `node <plugin>/scripts/doctor.mjs --root <projeto>` → `deepseek_key_format: "ok"`.

O Codex CLI do app desktop do Windows fica em `%LOCALAPPDATA%OpenAICodexin<build>codex.exe`, fora do PATH; o router o encontra sozinho. Para outro local, defina `AI_ROUTER_CODEX_BIN` com o caminho absoluto.

Recomendado: rode o bootstrap do marketplace (`setup-claude.ps1` / `setup-claude.sh` na raiz do repositório `moralles-filmes/claude-plugins`). Ele instala/atualiza a versão Claude e a versão nativa Codex, valida, testa e roda o doctor.

Manual:

1. Claude: `claude plugin marketplace add moralles-filmes/claude-plugins` e `claude plugin install ai-router-br@morallesfilms-local`.
2. Codex: `codex plugin marketplace add moralles-filmes/claude-plugins --ref main` e `codex plugin add ai-router-br@morallesfilms-local`.
3. No checkout do plugin: `npm test`, `npm run security:audit` e `npm run validate`.
4. `node <plugin>/scripts/doctor.mjs --root <projeto>`.

Não é preciso rodar `init` por projeto: o primeiro uso do router auto-inicializa `.ai-router/` e sincroniza o bloco curto em `CLAUDE.md`/`AGENTS.md`.

Nunca cole chaves no chat. O router não precisa de `OPENAI_API_KEY` nem `ANTHROPIC_API_KEY`; o Codex deve usar login ChatGPT.
