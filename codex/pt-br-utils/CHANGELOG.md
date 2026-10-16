# CHANGELOG

## [1.0.0] — 2026-09-18

### Adicionado
- Plugin novo com as skills `pt-br-translator` e `token-budget-analyst`, movidas do `saas-shield-br` 2.1.1 (histórico do git preservado via `git mv`).

### Corrigido (token-budget-analyst)
- Removida a instrução de rodar `claude session info` (comando inexistente); a medição no Claude Code é via `/cost` e `/context`, e na API via `usage.cache_creation_input_tokens` / `usage.cache_read_input_tokens`.
- Removida a afirmação de que dá para "marcar arquivos como estáveis" para manter cache — não existe esse mecanismo; o que preserva o cache é manter o prefixo da conversa estável e não reler arquivos.
- Preços e IDs de modelo (Opus 4.7 a $15/$75) saíram do texto: a skill agora manda conferir na skill `claude-api` (marketplace anthropic-agent-skills) ou em docs.claude.com e mostra só a fórmula de custo.
- "Task/Agent tool" → "Agent tool".
