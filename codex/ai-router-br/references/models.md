# Catálogo de modelos — revisado em 2026-10-16

A escada de modelos fica em `templates/config.yml` (`routing.*`) e, como cópia de segurança, em `lib/models.mjs` (`DEFAULT_ROUTING`); um teste exige que as duas sejam iguais. Revise este arquivo e a escada quando um fornecedor lançar, aposentar ou reprecificar modelo.

## Escada por complexidade

| Complexidade | 1º degrau | Fallback, em ordem | Quando |
|---|---|---|---|
| `mechanical` | DeepSeek | Codex `gpt-6-luna` · low → Claude Haiku | rename, boilerplate, fixtures, inventário, docs |
| `simple` | DeepSeek | Codex `gpt-6-luna` · medium → Claude Haiku | mudança localizada ou plano já mapeado em `steps` |
| `standard` | Codex `gpt-6.1-sol` · low | Codex `gpt-6-sol` · low → DeepSeek → Claude Sonnet | feature ou bug comum |
| `complex` | Codex `gpt-6.1-sol` · high | Codex `gpt-6-sol` · high → Claude Sonnet | arquitetura, concorrência, performance, causa raiz |

TIER 0 (risco crítico) não entra na escada: fica sempre com o agente principal. A complexidade escolhe o modelo, nunca o tier de risco.

Um degrau é pulado quando não está disponível nesta máquina (`skipped_candidates` no dry-run, `routing` no `doctor`):

- Codex: binário não encontrado (`codex_not_found`) ou modelo fora de `~/.codex/models_cache.json` (`codex_model_not_listed`). O cache é escrito pelo próprio Codex CLI com os modelos que a conta pode usar; sem o cache, o router não filtra. Esforço que o modelo não lista cai para o padrão do modelo.
- DeepSeek: chave ausente ou malformada (`deepseek_key_missing`/`deepseek_key_malformed`); tarefa que precisa de arquivo fora de `allowed_files` (`deepseek_needs_unsent_files`), arquivo maior que `max_file_chars` (`deepseek_file_too_large`) ou reescrita maior que uma resposta (`deepseek_output_too_large`).
- Claude: só existe quando o agente principal é o Claude Code (`claude_host_required` fora dele).

No dispatch, a escada desce sozinha quando um degrau está indisponível. Modelo recusado pela conta (`model_unavailable`) tenta o próximo modelo do mesmo executor. Falha do executor inteiro (login, binário, limite de uso) pula os outros modelos dele.

## OpenAI — Codex via login ChatGPT

Fonte: models_cache.json local (fetched 2026-10-16), https://learn.chatgpt.com/docs/models, https://learn.chatgpt.com/docs/pricing, https://developers.openai.com/api/docs/pricing.

| Modelo | Papel oficial | Créditos Codex por 1M tokens (in / cached / out) | API US$ por 1M (in / out) |
|---|---|---|---|
| `gpt-6-luna` | rápido e barato, tarefas focadas e repetíveis | 2,5 / 0,25 / 12,5 | 0,10 / 0,50 |
| `gpt-6.1-sol` | workhorse atual, perto do Astra a custo menor | 50 / 2,5 / 250 | 2,00 / 10,00 |
| `gpt-6-sol` | workhorse da geração anterior | 50 / 5 / 250 | 2,00 / 10,00 |
| `gpt-6-astra` | fronteira, trabalho mais difícil | 250 / 25 / 1.250 | 10,00 / 50,00 |
| `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.6-sol` | geração antiga, ainda disponível | 5 / 30 · 50 / 300 · 100 / 500 (out) | — |

- O Luna custa 20× menos créditos que o 6.1-Sol e 100× menos que o Astra. O Astra fica **fora da escada** de propósito: só roda com `--executor codex --model gpt-6-astra`.
- Esforço: `-c model_reasoning_effort="low|medium|high|xhigh|max|ultra"` (Luna vai até `max`). Esforço maior gasta mais tokens; não há multiplicador publicado.
- `gpt-6.1-sol` ainda está em rollout: algumas contas recebem "model is not supported when using Codex with a ChatGPT account". O router trata isso como `model_unavailable` e desce para `gpt-6-sol`.
- O modelo do `~/.codex/config.toml` do usuário só vale quando o Codex é forçado sem degrau na escada (legado).
- No Windows, o app desktop instala o CLI em `%LOCALAPPDATA%\OpenAI\Codex\bin\<build>\codex.exe`, fora do PATH: o router procura lá (o mais recente) depois do PATH. `AI_ROUTER_CODEX_BIN` (caminho absoluto) força outro binário.

## DeepSeek — API

Fonte: https://api-docs.deepseek.com/quick_start/pricing, https://api-docs.deepseek.com/api/create-chat-completion, https://api-docs.deepseek.com/quick_start/rate_limit, https://api-docs.deepseek.com/guides/json_mode.

| Modelo | O que é | US$ por 1M — pico (cache miss in / out) | Fora do pico |
|---|---|---|---|
| `deepseek-flash` | V4.1-Flash (usado) | 0,30 / 1,20 | 0,15 / 0,60 |
| `deepseek-v4-pro` | V4-Pro | 1,32 / 3,96 | 0,66 / 1,98 |

- Pico: 01:00–04:00 e 06:00–10:00 UTC, dias úteis. O budget usa sempre o preço de pico (limite superior).
- `deepseek-chat`/`deepseek-reasoner` foram descontinuados em 2026-07-24.
- Contexto de 1M e saída de até 384K tokens; o config limita a saída a `max_output_tokens: 32000` por custo.
- `thinking: {type: "disabled"}` desliga o raciocínio. Modo JSON exige a palavra "json" e um exemplo no prompt; a resposta pode vir vazia de vez em quando (o worker repete uma vez).
- Requisição na fila recebe linhas em branco por até 10 minutos antes da inferência começar, por isso `timeout_ms: 600000`.
- A chave precisa ser ASCII imprimível sem espaços (20+ caracteres). Uma chave gravada como tecla (Ctrl+V vira o caractere 22) fazia o `fetch` recusar o header com `UND_ERR_INVALID_ARG`, que antes parecia falha de rede.

## Anthropic — subagentes do Claude Code

Fonte: https://platform.claude.com/docs/en/about-claude/pricing, https://code.claude.com/docs/en/sub-agents.

| Alias | Modelo | US$ por 1M (in / out) | Papel no router |
|---|---|---|---|
| `haiku` | Claude Haiku 5.5 | 0,10 / 0,50 (até 100K de prompt) | `ai-router-br:claude-worker-haiku` — mecânico/simples |
| `sonnet` | Claude Sonnet 5.5 | 2 / 10 | `ai-router-br:claude-worker-sonnet` — padrão/complexo |
| `opus` | Claude Opus 5.5 | 4 / 20 | agente principal típico: decide, revisa, TIER 0 |
| `fable` | Claude Fable 5.1 | 10 / 50 | fora do router |

- O CLI do router não abre subagente: devolve `executor: claude`/`status: delegate_claude` com `claude_agent`, e o agente principal chama o Agent tool com esse `subagent_type`. O `model:` do frontmatter de cada agente fixa o modelo.
- O subagente trabalha na árvore principal com as permissões da sessão, como o principal faria. Por isso `dirty_worktree`, `tracked_secret` e `not_git_repo`, que só bloqueiam workers externos, não forçam mais o modelo mais caro.
