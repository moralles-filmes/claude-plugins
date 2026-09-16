# Arquitetura — ai-router-br

## Princípio central

Existe exatamente **um orquestrador principal por sessão**: Claude Code quando a sessão foi aberta no Claude; Codex quando a sessão foi aberta no Codex. O router não troca o agente principal e não configura um segundo agente principal.

## Fluxo

```text
pedido normal (o usuário não precisa citar o router)
  -> agente principal aciona a skill de roteamento (Claude: ai-router-br:route · Codex: $ai-router)
  -> CLI auto-inicializa o projeto se necessário (idempotente, silencioso)
  -> classifica risco/escopo/custo
  -> pequena? resolve diretamente
  -> TIER 0? agente principal
  -> TIER 1? Codex worker -> fallback DeepSeek apenas se indisponível/limite
  -> TIER 2/3? DeepSeek -> fallback Codex
  -> worker em worktree isolada (repo limpo, .ai-router/ não versionado)
  -> descarta arquivos ignorados criados pelo worker
  -> valida allowlist + HEAD inalterado + repositório principal intocado
  -> gera patch + resultado (testes adiados: tests_pending)
  -> agente principal revisa, aplica o que aprovar e roda os testes na árvore real
  -> mudança sensível? auditoria de módulo (saas-audit-br quando instalado)
  -> regressão
  -> integração/conclusão
```

## Auto-inicialização

Todo comando de roteamento do CLI (`dry-run`, `classify`, `dispatch`, `new-task`) chama `ensureInitialized` antes de classificar. Sem pedir autorização e sem saída extra além do campo `auto_init` do JSON:

1. resolve a raiz do projeto (top-level do Git quando existir);
2. cria `.ai-router/TASKS/`, `.ai-router/RESULTS/`, `config.yml` (do template), `STATE.md` e `REPORT.md` — somente o que faltar;
3. adiciona `.ai-router/` ao exclude local do Git (`git rev-parse --git-path info/exclude`), uma única vez;
4. na primeira inicialização, sincroniza o bloco curto delimitado por `<!-- ai-router-br:start/end -->` em `CLAUDE.md` e `AGENTS.md`, preservando todo o conteúdo existente e removendo duplicatas;
5. segue com a classificação normalmente.

Nunca inicializa o diretório home, a raiz do disco, `~/.claude`, `~/.codex`, pastas fora de um repositório Git (nelas o router só classifica, com os padrões do plugin), repositórios com `.ai-router/` versionado ou processos de worker (`AI_ROUTER_WORKER=1`) — nesses casos `auto_init.status` é `skipped` com o motivo. Não grava secrets. O gate de Git limpo ignora diferenças em `CLAUDE.md`/`AGENTS.md` que consistam **exclusivamente** no bloco do router; qualquer outra edição continua bloqueando workers externos.

## Como o principal descobre o router sem ser citado

- **Claude Code:** hook `SessionStart` do plugin injeta duas linhas de contexto indicando a skill `ai-router-br:route` para pedidos substanciais; depois da primeira inicialização o bloco em `CLAUDE.md` mantém a regra no projeto.
- **Codex:** a skill `$ai-router` tem descrição de invocação implícita; o setup também sincroniza o mesmo bloco curto em `~/.codex/AGENTS.md` (global) e o primeiro uso adiciona o bloco ao `AGENTS.md` do projeto.

## Isolamento

External workers só executam quando o git está limpo. `git worktree add --detach` cria uma cópia temporária fora do projeto. O worker nunca faz commit/push (HEAD é verificado) e o router nunca aplica o patch automaticamente na árvore principal.

Se a árvore estiver suja, o router retorna `status: blocked` com `dirty_worktree` e escala ao agente principal. Isso evita perder mudanças locais ou dar ao worker uma visão incompleta do estado atual.

## Contexto

Workers recebem um TASK PACKAGE mínimo e somente arquivos permitidos. O histórico de chat não é enviado. Estado persistente fica em `.ai-router/` para sobreviver a compactação e novas sessões.

## Integração com outros plugins

`ai-router-br` é transversal e não importa `saas-builder-br`, `saas-audit-br`, `saas-shield-br`, `code-health` ou `turbo`. Esses plugins podem, quando o router estiver disponível, chamar a skill de roteamento ou o CLI — dependência unidirecional, sem ciclos:

```text
plugin especializado -> ai-router-br (skill/CLI) -> worker
```

Para auditoria, a skill de roteamento reutiliza `/saas-audit-br:module` quando o plugin está instalado (`doctor` informa `optional_integrations.saas_audit_br`). Sem ele, o principal faz a revisão e declara que a auditoria externa não rodou — nunca finge que rodou.
