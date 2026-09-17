# ai-router-br — Codex

Plugin nativo Codex para roteamento seguro entre **esta sessão Codex (principal)**, **Codex worker isolado autenticado via ChatGPT** e **DeepSeek worker por API**. A versão Claude Code fica em [`../../ai-router-br`](../../ai-router-br/); o núcleo (`lib/`, `workers/`, `scripts/`, `tests/`, `templates/`, `references/`) é idêntico nas duas e isso é verificado por `scripts/validate.mjs` na raiz do marketplace.

## Componentes
- 5 skills Codex nativas com `agents/openai.yaml` (`$ai-router` com invocação implícita; `$ai-router-dry-run`, `$ai-router-main-only`, `$ai-worker-codex`, `$ai-worker-cheap`);
- auto-inicialização idempotente de `.ai-router/` no primeiro uso em cada projeto;
- classificador contextual TIER 0–3 e TASK PACKAGE enxuto;
- Codex worker não-interativo (login ChatGPT obrigatório) e DeepSeek worker com JSON estruturado, budget e sem shell;
- worktrees isoladas, allowlist/denylist, fallback apenas por indisponibilidade, patch nunca integrado automaticamente.

## Instalação
```bash
codex plugin marketplace add moralles-filmes/claude-plugins --ref main
codex plugin add ai-router-br@morallesfilms-local
node <plugin-root>/scripts/sync-rules.mjs --codex-home --apply   # bloco curto no AGENTS.md global
```
O `setup-claude.ps1`/`setup-claude.sh` do marketplace faz tudo isso.

## Uso
Abra qualquer projeto no Codex e peça normalmente; para trabalho substancial a skill `$ai-router` classifica e, no primeiro uso, cria `.ai-router/` (ignorado localmente pelo Git) e o bloco curto em `CLAUDE.md`/`AGENTS.md`.

Quando o router classifica ou despacha uma tarefa, o Codex copia na resposta a linha `summary_line` do CLI, por exemplo:

```text
🔀 Router · TIER 2 → DeepSeek (deepseek-flash) · sucesso · US$0,0004 · 1,8 s
🔀 Router · TIER 1 → Codex (gpt-5.6-sol) · sucesso · sem custo de API · 2,1 min
```

O Codex não tem hook equivalente ao do Claude Code, então a linha depende do agente seguir a skill. O histórico fica em `.ai-router/COSTS.jsonl`.

## Validação
```bash
npm test
npm run security:audit
npm run validate
python <codex-home>/skills/.system/plugin-creator/scripts/validate_plugin.py codex/ai-router-br
```

Nenhum secret deve ser colocado no Git, CLAUDE.md, AGENTS.md ou `.ai-router/`.
