# CHANGELOG

## [0.3.0] — 2026-09-18

### Corrigido
- **Detector 1b (botões sem handler) nunca rodava.** O padrão usa lookahead `(?!...)`, que o motor padrão do ripgrep não suporta — o comando falhava em silêncio (`2>/dev/null`) e o detector reportava zero achados. Adicionado `-P` (PCRE2) em `functional-auditor` e na biblioteca de padrões do `functional-audit`.
- **Detector 4 (eslint) quebrava com ESLint 9.** `--no-eslintrc`, `--parser`, `--plugin` e `--ext` foram removidos no flat config, então `npx eslint@latest` abortava. Agora usa a config do projeto quando existe; sem config, fixa `eslint@8` + `@typescript-eslint/*@7`.
- Comandos `/audit`, `/cleanup`, `/health`: `allowed-tools` listava `Task` (nome antigo). Agora `Agent`.

### Alterado
- "Modo turbo" do `functional-audit` renomeado para **"modo automático"** — `turbo` é o plugin de performance do mesmo marketplace, e a palavra-chave disparava confusão de roteamento.

## [0.2.2] e anteriores

Sem changelog. Ver histórico do git.
