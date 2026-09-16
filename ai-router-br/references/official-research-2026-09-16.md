# Pesquisa oficial — 2026-09-16

## Claude Code

Fontes oficiais consultadas:
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks-guide

Conclusões usadas: skills ficam em `skills/<name>/SKILL.md`; plugins usam `.claude-plugin/plugin.json`; skills de plugin são namespaced; `${CLAUDE_PLUGIN_ROOT}` é a raiz portátil do plugin; subagents suportam restrição de tools e `isolation: worktree`; hooks `PreToolUse` podem negar ações. O router não cria outro main agent.

## Codex

Fontes oficiais consultadas:
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/hooks
- https://github.com/openai/codex
- validator/scaffold atual do `plugin-creator` no repositório `openai/codex`

Conclusões usadas: `codex login` suporta ChatGPT; `codex login status` verifica o método ativo; `codex exec` é o modo não-interativo; `--sandbox workspace-write`, `--json` e `--ephemeral` são opções atuais; skills locais usam `.agents/skills`; `agents/openai.yaml` é metadado de skill; Codex possui plugins com `.codex-plugin/plugin.json`. O manifesto desta entrega segue o contrato atual do validator oficial, incluindo interface completa e `defaultPrompt`.

## DeepSeek

Fontes oficiais consultadas:
- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/updates/
- https://api-docs.deepseek.com/news/news260910/
- https://api-docs.deepseek.com/quick_start/rate_limit/
- https://api-docs.deepseek.com/quick_start/agent_integrations/codex/

Conclusão usada: em 2026-09-16, `deepseek-flash` aponta para DeepSeek-V4.1-Flash, com 1M de contexto, JSON output, tool calls e Responses API. O preço de pico publicado é US$0,30/MTok de input cache-miss e US$1,20/MTok de output; o config guarda a data da cotação e deve ser revisto periodicamente. A integração oficial que troca o provider do Codex por DeepSeek **não é usada**, porque aqui Codex deve continuar autenticado pelo ChatGPT e DeepSeek deve ser um worker API independente.
