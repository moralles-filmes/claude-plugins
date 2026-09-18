# pt-br-utils

> Duas skills de workflow para devs brasileiros que não cabiam num plugin de segurança. Extraídas do `saas-shield-br` na v2.2.0.

## Skills

| Skill | O que faz | Quando dispara |
|---|---|---|
| `pt-br-translator` | Revisa strings de UI em PT-BR: você/tu, gênero, tradução literal ("Algo foi errado" → "Algo deu errado"), formato BR de data/número/moeda/CPF/CNPJ, mensagens de erro úteis, empty states, glossário de termos | "revisa o português", "checa as strings da UI", "audit pt-br", arquivos de i18n `pt-BR.*` |
| `token-budget-analyst` | Diagnostica desperdício de tokens em 7 áreas (system prompt, tool descriptions, Read de arquivos, repetição, prompt caching, sub-agents, skills auto-load) e entrega relatório com economia estimada | "tá caro de tokens", "sessão pesada", "otimizar contexto", "token budget" |

Nenhuma das duas tem agente, hook ou comando — são skills invocadas por gatilho de linguagem natural.

## Instalação

```bash
claude plugin marketplace add /caminho/para/claude-plugins   # uma vez
claude plugin install pt-br-utils
```

## Versionamento

Versão atual: **1.0.0** — ver [CHANGELOG.md](./CHANGELOG.md).

## Licença

MIT.
