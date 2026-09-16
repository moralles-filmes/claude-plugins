# Instalação

Pré-requisitos: Node.js 20+, Git, agente principal autenticado pelo plano, Codex CLI autenticado via ChatGPT e `DEEPSEEK_API_KEY` local somente se DeepSeek for usado.

Recomendado: rode o bootstrap do marketplace (`setup-claude.ps1` / `setup-claude.sh` na raiz do repositório `moralles-filmes/claude-plugins`). Ele instala/atualiza a versão Claude e a versão nativa Codex, valida, testa e roda o doctor.

Manual:

1. Claude: `claude plugin marketplace add moralles-filmes/claude-plugins` e `claude plugin install ai-router-br@morallesfilms-local`.
2. Codex: `codex plugin marketplace add moralles-filmes/claude-plugins --ref main` e `codex plugin add ai-router-br@morallesfilms-local`.
3. No checkout do plugin: `npm test`, `npm run security:audit` e `npm run validate`.
4. `node <plugin>/scripts/doctor.mjs --root <projeto>`.

Não é preciso rodar `init` por projeto: o primeiro uso do router auto-inicializa `.ai-router/` e sincroniza o bloco curto em `CLAUDE.md`/`AGENTS.md`.

Nunca cole chaves no chat. O router não precisa de `OPENAI_API_KEY` nem `ANTHROPIC_API_KEY`; o Codex deve usar login ChatGPT.
