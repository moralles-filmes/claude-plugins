# ai-router-br — Claude Code

Plugin transversal para roteamento seguro entre **Claude principal**, **Codex worker autenticado via ChatGPT** e **DeepSeek worker por API**. A versão nativa para Codex fica em [`../codex/ai-router-br`](../codex/ai-router-br/).

## Componentes
- 6 skills Claude (`route` automática; `dry-run`, `status`, `use-codex`, `use-deepseek`, `main-only` manuais);
- hook `SessionStart` curto para o router ser acionado sem ser citado;
- hook `PostToolUse` que mostra no chat quem executou cada tarefa (executor, modelo, status, custo);
- auto-inicialização idempotente de `.ai-router/` no primeiro uso em cada projeto;
- classificador contextual TIER 0–3;
- TASK PACKAGE enxuto;
- Codex worker não-interativo (login ChatGPT obrigatório);
- DeepSeek worker com JSON estruturado, budget e sem shell;
- worktrees isoladas, HEAD verificado;
- allowlist/denylist de arquivos e comandos;
- fallback apenas por indisponibilidade;
- patch nunca integrado automaticamente;
- doctor, sync CLAUDE.md/AGENTS.md, auditoria de segurança e testes.

## Uso normal

Depois de instalado, abra qualquer projeto e peça normalmente. Para trabalho substancial o Claude aciona `ai-router-br:route`, que na primeira vez cria `.ai-router/` (ignorado localmente pelo Git) e o bloco curto em `CLAUDE.md`/`AGENTS.md`, e segue com a classificação.

Sempre que o router classifica ou despacha uma tarefa, aparece no chat uma linha como:

```text
🔀 Router · TIER 2 → DeepSeek (deepseek-flash) · sucesso · US$0,0004 · 1,8 s
🔀 Router · TIER 1 → Codex (gpt-5.6-sol) indisponível → DeepSeek (deepseek-flash) · sucesso · US$0,0003 · 1,7 s
🔀 Router · TIER 0 → agente principal
```

Ela vem do hook `PostToolUse` do plugin e também é copiada pelo Claude na resposta. Sem essa linha, quem fez a tarefa foi o próprio Claude. O histórico fica em `.ai-router/COSTS.jsonl`.

## CLI

```bash
node scripts/ai-router.mjs dry-run --root . --objective "Criar módulo de fornecedores"   # auto-inicializa se preciso
node scripts/ai-router.mjs dispatch --root . --task .ai-router/TASKS/TASK-001.json
node scripts/ai-router.mjs init --root .                                                # opcional/explícito
node scripts/doctor.mjs --root .
```

## Validação
```bash
npm test
npm run security:audit
npm run validate
claude plugin validate ./ai-router-br
```

Nenhum secret deve ser colocado no Git, CLAUDE.md, AGENTS.md ou `.ai-router/`. Detalhes: [references/security.md](references/security.md).
