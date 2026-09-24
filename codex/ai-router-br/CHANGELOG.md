# Changelog

## 1.3.2 — 2026-09-24
Problemas de escopo do TASK PACKAGE aparecem já no dry-run e com nome.

### Corrigido
- Curinga (`*`, `?`) em `allowed_files`/`relevant_files` bloqueia o dispatch como `glob_not_supported:<campo>:<caminho>` em vez de um `invalid_path` genérico. As duas listas continuam literais; só `forbidden_files` aceita padrão.

### Adicionado
- Dry-run de tarefa delegável traz `dispatch_error`/`dispatch_error_detail` quando o dispatch vai ser bloqueado por caminho ou por comando de teste (`unsafe_test_command`), com o caminho ou comando recusado, e `relevant_not_sent` (os `relevant_files` fora de `allowed_files` ou na denylist, que o worker não recebe); o `summary_line` diz os dois. O que vai para a API não mudou.
- A skill `ai-router` diz quais formas de `tests` passam e quais não (`npx`, atalho `pnpm build`, `pnpm exec`/`--filter`, `./node_modules/.bin/...`, texto livre — verificação manual vai em `acceptance`). A allowlist não foi afrouxada.

## 1.3.1 — 2026-09-19
O gate de risco enxerga PT-BR. Espelho da correção de 1.3.0: lá o problema era casar demais, aqui era não casar nada.

### Adicionado
- `CRITICAL_DOMAIN` reconhece `permissão/permissões`, `autenticação`, `segredo`, `chave secreta`, `chave de api`, `senha`, `jwt`, `criptografia`, `controle de acesso`, `conceder/revogar/negar acesso` e `service_role` (que `\brole\b` não pegava porque `_` é caractere de palavra).
- `CRITICAL_ACTION` ganha `grant`, `revoke`, `bypass`, `disable`, `enable`, `rotacionar`, `conceder`, `revogar`, `configurar`, `desabilitar`, `habilitar`, `usar` — sem eles o risco parava em 3 mesmo com o domínio reconhecido.

### Notas
- `pagamento`, `faturamento`, `cobrança`, `autorização` e `acesso` solto ficam de fora de propósito: vocabulário corrente de ERP, escalá-los repetiria o caso "produção" corrigido em 1.3.0.

## 1.3.0 — 2026-09-19
Workers externos voltam a receber trabalho. Nenhum dispatch tinha acontecido desde a instalação.

### Corrigido
- Gate `small` em `lib/classifier.mjs` devolvia ao principal quase toda tarefa: `files.length <= small_task_max_files` passava com 0 arquivos (`0 <= 1`) e a skill mandava classificar por `--objective "<resumo curto>"`, sempre abaixo de `small_task_max_chars`. Sobrava só o regex `BROAD`, que não cobre o vocabulário de `CHEAP`/`MECH`. Os tiers 2 e 3, únicos em que o DeepSeek é executor primário, eram os mais capturados.
- `small` agora exige tier 3, escopo de arquivos declarado (`files.length >= 1`) e ausência de `CHEAP`.
- Tokens curtos das regexes de risco casavam por substring e forçavam TIER 0 com `audit_required` falso: `role` em "cont**role**", `drop` em "**drop**down", `secret` em "**secret**aria", `fix` em "**fix**tures", `api` em "r**api**dez", `test` em "**test**emunho". Todos ancorados em `\b`.
- `produção` sozinha deixou de ser domínio crítico (vocabulário de negócio); só conta como ambiente quando qualificada, ou como `production`/`prod` em inglês.

### Alterado
- Skill `ai-router`: TASK PACKAGE com `allowed_files` escrito **antes** da classificação; removida a válvula "delegue só com ganho real".
- Skill `ai-router-dry-run`: avisa que sem `allowed_files` o veredito não reflete o do fluxo real.

## 1.2.1 — 2026-09-17
Sem mudança funcional no Codex; versão alinhada à correção da skill `route` do Claude Code (auditoria de módulo via `saas-audit-br:module`).

## 1.2.0 — 2026-09-17
Mostra no chat quem executou cada tarefa.

### Adicionado
- `summary_line` como primeira chave do JSON de `dry-run`/`classify`/`dispatch` e dos erros do CLI: tier, executor, modelo (DeepSeek pelo config do plugin; Codex pela chave `model` de topo do `config.toml` do usuário), status, fallback, custo e duração. Montada só com campos fixos, códigos e números.
- Hook `PostToolUse` (Claude Code, `Bash|PowerShell` filtrado por `if` para `ai-router.mjs`) que mostra a linha ao usuário como `systemMessage`, sem depender do modelo. Nunca bloqueia; fica calado para outros comandos e dentro de workers.
- Skills (Claude e Codex) mandam o agente principal copiar o `summary_line` literalmente na resposta.

## 1.1.0 — 2026-09-16
Instalação no marketplace `morallesfilms-local`, com auditoria do pacote 1.0.0.

### Adicionado
- Auto-inicialização idempotente no primeiro uso em qualquer projeto (`.ai-router/`, exclude local do Git, `config.yml`, estado mínimo e bloco curto em `CLAUDE.md`/`AGENTS.md`), sem autorização e sem duplicar conteúdo.
- Hook `SessionStart` (Claude) para acionar `ai-router-br:route` em pedidos substanciais sem o usuário citar o router.
- `sync-rules.mjs --codex-home` para o mesmo bloco no `AGENTS.md` global do Codex.
- `doctor`: método de login do Codex, prontidão de worker externo com motivos, detecção de `saas-audit-br`, checagem de chave também no escopo User/Machine do Windows (só presença).
- Resultado `status: blocked` estruturado para repo sujo, secret rastreado e comando de teste inseguro.

### Corrigido (segurança)
- Denylist `**/…` não bloqueava arquivos na raiz (`credentials.json`, `*.pem`, `*.key`, `secrets.*`); `.git/` na raiz também passa a ser bloqueado.
- Fallback do Codex podia mascarar teste quebrado ou violação de escopo (regex genérica em qualquer erro); agora só falhas de login/execução do Codex contam como indisponibilidade.
- Arquivos dentro de diretórios novos escapavam da validação de escopo (`git status` colapsado).
- Commit feito pelo worker escondia mudanças da validação; `git commit/push` e `npm publish` eram aceitos como comando de teste.
- `forbidden_files` do TASK PACKAGE não era aplicado.
- Symlinks podiam enviar arquivos de fora do repositório ao DeepSeek ou redirecionar escrita.
- Caminhos com `:`/ponto final (truques do Windows) passavam na normalização.
- Ambiente do worker mantinha `DATABASE_URL` com senha, `*_ACCESS_KEY`, `*_AUTH`.
- `.ai-router/config.yml` do projeto (inclusive versionado num clone) podia redirecionar a `DEEPSEEK_API_KEY`, trocar o comando do Codex, usar `danger-full-access`, desligar login ChatGPT/Git limpo e ampliar allowlist/budget. Agora o config do projeto só aperta a segurança, um config rastreado é ignorado e `.ai-router/` versionado bloqueia o dispatch (`tracked_router_config`).
- Testes rodavam código do worker fora do sandbox antes da revisão; arquivos escondidos por `.gitignore` do próprio worker rodavam sem aparecer no patch e podiam alterar o repositório principal. Agora os testes são adiados ao principal por padrão (`tests_pending`), arquivos ignorados criados pelo worker são descartados e escritas no repositório principal durante execução/testes viram `scope_violation`.
- Redaction sobre o JSON serializado podia quebrar o registro do resultado e alterar o patch em silêncio; agora é campo a campo e o patch só é mascarado com `patch_redacted: true`.
- Budget do DeepSeek aceitava valor não numérico (sem limite) e valor acima do teto do config.
- Allowlist de testes aceitava `node -e`, caminhos com nome permitido (`./bin/jest`), `npx`, `npm exec` e flags de configuração do npm; `git` aceitava `--output`/`-O`/`--ext-diff`.
- Allowlist de testes aceitava `node --test-reporter=data:...` (código inline) ou reporter/destino arbitrários, e pager do `git grep` via flags curtas agrupadas (`-iO<pager>`) e abreviações (`--open-files-in-pag=`).
- `.ai-router/` versionado com outra caixa (`.AI-ROUTER/`) escapava da detecção no Windows/macOS e o `config.yml` era lido.
- Descarte de arquivos ignorados apagava arquivos fora da worktree através de junction/symlink criado pelo worker; links criados pelo worker agora são removidos sem serem seguidos e reprovam a validação.
- `budgets.default_profile` do config do projeto podia subir o perfil padrão de budget.
- Gate de secret rastreado não via caminhos com acento (`git ls-files` sem `-z`) e bloqueava código (`secrets.ts`) e documentação (`secrets.example.json`).
- Gate de Git limpo aceitava qualquer texto entre os marcadores do router.
- Config do Git do usuário (`diff.external`, `diff.noprefix`, cor) alterava o patch.
- Login do Codex aceitava código de saída diferente de 0; texto da própria tarefa ("401", "network") podia disparar fallback indevido.

### Corrigido (auto-inicialização e setup)
- Marcador de início solto em `CLAUDE.md`/`AGENTS.md` fazia a segunda sincronização apagar o texto do usuário; `lib/rules.mjs` tinha bytes NUL literais (git o tratava como binário).
- Auto-init não escreve mais fora de repositórios Git, em `~/.claude`/`~/.codex` nem em `.ai-router/` versionado.
- Worktree de falhas elegíveis a fallback não fica mais para trás; diretório temporário removido se `git worktree add` falhar.
- Hook `SessionStart` também em `resume`.

### Corrigido (funcional)
- Skills referenciavam `scripts/ai-router.mjs` relativo ao projeto; agora usam `${CLAUDE_PLUGIN_ROOT}`.
- Falha de rede, 402 e timeout do DeepSeek passam a ser indisponibilidade (fallback para Codex); budget acumulado entre tentativas.
- `npm` como comando de teste no Windows sem shell; kill da árvore de processos no timeout; EPIPE no stdin.
- `sync-rules` agora verifica de fato se o bloco é idêntico nos dois arquivos.

## 1.0.0 — 2026-09-16
- Initial router, workers, safety gates, skills, tests and docs.
