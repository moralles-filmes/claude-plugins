# Changelog

## 1.4.1 — 2026-10-24
- Node recomendado passa a 22+ (`engines`, INSTALL, setup): o 20 está em fim de vida desde 30/04/2026. O `doctor` continua aceitando o 20, com o aviso `node_eol_upgrade_to_22_or_24` no campo novo `warnings` e o campo `node_22_plus`.
- `references/security.md`: a regra de `.env` público é a mesma do saas-shield-br (`scripts/security/env-public.mjs`).
- Codex: skill nova `$ai-router-status` (paridade com o `status` do Claude).

## 1.4.0 — 2026-10-16
O router escolhe o modelo pela complexidade da tarefa, checa o que está disponível na máquina e termina a escada num subagente Claude barato, não no agente principal. Até aqui nenhum dispatch externo tinha dado certo: tudo voltava para o modelo mais caro.

### Diagnóstico (logs e transcrições locais)
- Em ~150 vereditos, nenhum dispatch externo teve sucesso. DeepSeek falhava em 769 ms com `deepseek_network_error:UND_ERR_INVALID_ARG`, o Codex com `spawn codex ENOENT`, e o resto era `dirty_worktree`. Em todos os casos a tarefa caía no agente principal.
- O Codex worker nunca passava `-m`. Ele herdava o modelo interativo do `~/.codex/config.toml` — `gpt-6-astra` em ~38 classificações, depois `gpt-6-sol` com `model_reasoning_effort = "high"` — para qualquer tarefa, inclusive um script de 2 arquivos.
- A `DEEPSEEK_API_KEY` salva no Windows tinha **1 caractere, código 22 (Ctrl+V)**: a tecla foi gravada no lugar da chave. O `fetch` recusava o header (`UND_ERR_INVALID_ARG`), o worker rotulava isso como erro de rede e repetia a chamada. `doctor` e `setup` só checavam se a variável existia.
- O app desktop do Codex instala o CLI em `%LOCALAPPDATA%OpenAICodexin<build>codex.exe`, fora do PATH.

### Adicionado
- **Escada de modelos por complexidade** (`routing.*` no config, `references/models.md`): `mechanical`/`simple` → DeepSeek → Codex `gpt-6-luna` (low/medium) → Claude Haiku; `standard` → Codex `gpt-6.1-sol` low → `gpt-6-sol` low → DeepSeek → Claude Sonnet; `complex` → `gpt-6.1-sol` high → `gpt-6-sol` high → Claude Sonnet. O `gpt-6-astra` (100× os créditos do Luna) fica fora da escada; só com `--executor codex --model gpt-6-astra`.
- **Complexidade** no classificador e no TASK PACKAGE (`complexity`, `steps`, `plan_ready`). Quando a complexidade é declarada, ela vale; quando não, é inferida pelo tier, pelo número de arquivos e por sinais como arquitetura, concorrência, performance e causa raiz. Um plano mapeado em `steps` desce um degrau. O tier de risco não muda: TIER 0 continua no principal.
- **Disponibilidade antes do dispatch**:
  - Codex: binário (PATH, shim npm `.cmd` via node, build mais recente do app desktop, `AI_ROUTER_CODEX_BIN`) e modelos da conta pelo `~/.codex/models_cache.json`.
  - DeepSeek: formato da chave, e se a tarefa cabe nele (sem tools, arquivo truncado, reescrita maior que uma resposta).
  - Claude: host Claude Code (`CLAUDECODE`/`AI_ROUTER_HOST`).
  - Degraus pulados saem em `skipped_candidates` e no `summary_line` (`indisponível: <código>`). O `doctor` mostra a escada da máquina.
- **Subagentes `claude-worker-haiku` e `claude-worker-sonnet`** como último degrau. Eles recebem `status: delegate_claude` com `claude_agent` quando:
  - os workers externos estão indisponíveis;
  - o repo bloqueia worker externo (`dirty_worktree`, `tracked_secret`, `tracked_router_config`, `not_git_repo`).
  - Falha sem fallback traz `suggested_next` com o subagente que deve fazer a correção.
- Codex: `-m <modelo>` e `-c model_reasoning_effort="<esforço>"` do degrau. Modelo recusado pela conta (`model_unavailable`, ex.: rollout do `gpt-6.1-sol`) desce para o próximo modelo. Falha do executor inteiro pula os outros modelos dele.
- CLI: `--executor claude`, `--model`, `--effort`, `--complexity`, `--host`.
- Auto-init atualiza um `.ai-router/config.yml` que ainda é idêntico ao template 1.3.4 (por hash). Sem isso, a cópia antiga (timeout de 180 s, sem escada) prevaleceria sobre os novos padrões. Config editado à mão não é tocado.

### Corrigido
- DeepSeek:
  - Chave malformada vira `auth_unavailable` (`deepseek_api_key_malformed`) antes de qualquer requisição.
  - Requisição recusada pelo `fetch` vira `request_invalid`, sem retry. Só erro de rede real repete.
  - Resposta truncada (`finish_reason: length`) vira `output_truncated`; vazia, `empty_output` (repetida uma vez); fora do formato, `output_unusable`. As três descem para o próximo degrau em vez de voltar ao principal.
  - Timeout não repete (`api_timeout`) e o padrão subiu de 180 s para 600 s: a API segura requisição na fila por até 10 min.
  - Arquivo maior que `max_file_chars` chegava truncado e voltava como "conteúdo completo" sem o final. Agora a tarefa é recusada para o DeepSeek.
- `doctor`, `setup.ps1`/`setup.sh` e o `setup-claude` da raiz validam o formato da chave (sem mostrar o valor) e encontram o Codex fora do PATH.

### Alterado
- Skill `route`: declare `complexity` e `steps`; com `executor: claude`/`delegate_claude`, chame o Agent tool com o `claude_agent` em vez de executar no principal.
- Projeto pode remover ou reordenar degraus em `routing.*`, nunca adicionar modelo ou complexidade (`config_ignored_settings`).
- `max_output_tokens` do DeepSeek de 16000 para 32000 e `max_context_chars` de 180000 para 400000 (preço de pico, `pricing_as_of: 2026-10-16`).

### Ação do usuário
- Regravar a chave: copie a chave do DeepSeek e rode `[Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', (Get-Clipboard).Trim(), 'User')`; reabra o editor; `doctor` deve mostrar `deepseek_key_format: "ok"`.
- Um `.ai-router/config.yml` editado à mão mantém os valores antigos (ex.: `deepseek.timeout_ms: 180000`, sem `routing`). Para receber os novos padrões, apague o arquivo: o próximo uso do router o recria a partir do template.

## 1.3.4 — 2026-10-07
O bloco do router deixa de ser duplicado em projetos que seguem o Padrão SaaS.

### Corrigido
- Num projeto em que o `CLAUDE.md` importa `@AGENTS.md`, o auto-init gravava o bloco nos dois arquivos e o Claude Code o carregava duas vezes. Agora o bloco fica só no `AGENTS.md`; se já existir uma cópia no `CLAUDE.md`, o `sync-rules` a remove.
- Remover o bloco do `CLAUDE.md` nesse caso conta como mudança de infraestrutura do router e não bloqueia a delegação por `dirty_worktree`. Qualquer outra edição continua bloqueando.
- A trava que impede o auto-init de escrever na pasta home e em `~/.claude`/`~/.codex` falhava quando o caminho passava por um atalho (no macOS, `/var` → `/private/var`): o git devolve o caminho real e a comparação não batia. Agora os dois lados são comparados pelo caminho real.

## 1.3.3 — 2026-09-25
Um `.env` versionado só com variáveis públicas do navegador deixa de bloquear a delegação.

### Corrigido
- O gate `tracked_secret` bloqueava qualquer `.env*` versionado só pelo nome, sem olhar o conteúdo. Caso real: um projeto Next.js versiona de propósito `.env.production` (o `.gitignore` abre exceção) com uma única linha, `NEXT_PUBLIC_API_URL=<url do backend>`. É valor que o próprio site publica, e mesmo assim toda tarefa delegável caía em `bloqueado (tracked_secret)`.
- Agora um `.env*` versionado passa quando **todas** as linhas são comentário ou `CHAVE=valor` com prefixo público do framework (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `EXPO_PUBLIC_`, `REACT_APP_`, `NUXT_PUBLIC_`, `GATSBY_`), e nenhum nome nem valor tem cara de segredo: nome com `KEY`/`TOKEN`/`SECRET`/`PASSWORD`/`AUTH`/`DSN`...; valor JWT, `sk-`, `ghp_`, `AKIA`, `AIza`, `sb_secret_`, `-----BEGIN` ou URL com usuário:senha.
- A checagem lê a versão do HEAD, que é a que a worktree do worker recebe. Qualquer outra coisa continua bloqueando: chave sem prefixo público, linha fora do formato (valor multilinha, bloco PEM), arquivo fora do HEAD ou maior que 16 KB. `credentials.json`, `secrets.*` e `*.pem|key|p12|pfx` não mudaram, e a denylist dos workers também não: eles continuam sem ler nem escrever `.env*`.

### Alterado
- A skill `route` pede que, em `status: blocked`, o agente diga ao usuário o motivo concreto do campo `error` (ex.: `tracked_secret:.env.production`), não só o código. O `summary_line` segue sem caminhos, de propósito.

## 1.3.2 — 2026-09-24
Problemas de escopo do TASK PACKAGE aparecem já no dry-run e com nome, em vez de um `invalid_path` genérico só no dispatch.

### Corrigido
- Curinga (`*`, `?`) em `allowed_files`/`relevant_files` caía em `normalizeRelative` e bloqueava o dispatch como `invalid_path`, sem dizer qual caminho nem por quê — e o dry-run, que não validava caminhos, tinha acabado de classificar a tarefa como delegável. Agora o bloqueio é `glob_not_supported:<campo>:<caminho>`. As duas listas continuam literais; só `forbidden_files` aceita padrão. Caso real: auditoria com `relevant_files: ["src/components/**/inventario*/**", ...]` classificada para o DeepSeek e bloqueada no dispatch.

### Adicionado
- Dry-run de tarefa delegável traz `dispatch_error`/`dispatch_error_detail` quando o dispatch vai ser bloqueado — por caminho (`glob_not_supported`, `invalid_path`, `path_traversal`) ou por comando de teste (`unsafe_test_command`, `forbidden_command`), com o caminho ou comando recusado no detalhe —, e `relevant_not_sent` com os `relevant_files` que o worker não vai receber (fora de `allowed_files` ou na denylist). O `summary_line` do dry-run diz os dois. O dispatch repete `relevant_not_sent` no resultado.
- Sem isso a lacuna era silenciosa: o DeepSeek não tem tools e só vê o conteúdo enviado, então uma auditoria só de leitura com `allowed_files` = relatório e `forbidden_files` = `src/**` chegaria a ele sem nenhum arquivo de código e devolveria um relatório inventado. O que vai para a API **não mudou**; só passou a ficar visível.
- A skill `route` diz quais formas de `tests` passam (`npm test -- <arquivo>`, `npm run <script>`, `pnpm run <script>`, `bun run <script>`, `node --test`, `node node_modules/typescript/bin/tsc` para typecheck sem script) e quais não (`npx`, atalho `pnpm build`, `pnpm exec`/`--filter`, `./node_modules/.bin/...`, texto livre — verificação manual vai em `acceptance`). Uma varredura dos TASK PACKAGEs locais achou 18 recusáveis em 5 projetos, todos por esses motivos e todos só descobertos no dispatch. A allowlist não foi afrouxada.

## 1.3.1 — 2026-09-19
O gate de risco enxerga PT-BR. Espelho da correção de 1.3.0: lá o problema era casar demais, aqui era não casar nada.

### Adicionado
- `CRITICAL_DOMAIN` reconhece os equivalentes PT-BR dos domínios sensíveis: `permissão/permissões`, `autenticação`, `segredo`, `chave secreta`, `chave de api`, `senha`, `jwt`, `criptografia`, `controle de acesso` e `conceder/revogar/negar acesso`. Também `service_role`, que `\brole\b` não pegava porque `_` é caractere de palavra. Sem isso o gate ficava cego justamente na língua em que os objetivos são escritos, e tarefa sensível podia ser despachada a um worker externo sem auditoria.
- `CRITICAL_ACTION` ganha os verbos que faltavam: `grant`, `revoke`, `bypass`, `disable`, `enable`, `rotacionar`, `conceder`, `revogar`, `configurar`, `desabilitar`, `habilitar`, `usar`. Sem eles o risco parava em 3 mesmo com o domínio reconhecido — "rotacionar chave secreta" e "usar service_role" não alcançavam o TIER 0. Verbo crítico só pontua junto com domínio crítico, então pode ser generoso.

### Notas
- Ficam **de fora de propósito** `pagamento`, `faturamento`, `cobrança`, `autorização` e `acesso` solto: são vocabulário corrente de ERP ("ordem de pagamento", "autorização de compra", "melhorar o acesso à tela") e escalá-los repetiria o caso "produção" corrigido em 1.3.0. O sentido de controle de acesso já é coberto por `permissão`/RBAC/`role` e pelas locuções. Os testes fixam as duas direções.

## 1.3.0 — 2026-09-19
Workers externos voltam a receber trabalho. Nenhum dispatch tinha acontecido desde a instalação.

### Corrigido
- Gate `small` em `lib/classifier.mjs` devolvia ao principal quase toda tarefa. A condição `files.length <= small_task_max_files` passava com 0 arquivos (`0 <= 1`) e a skill mandava classificar por `--objective "<resumo curto>"`, sempre abaixo de `small_task_max_chars` — sobrava só o regex `BROAD` como defesa, e ele não cobre o vocabulário de `CHEAP`/`MECH` (`boilerplate`, `repetitiv`, `bulk`, renomeação em massa). Os tiers 2 e 3, únicos em que o DeepSeek é executor primário, eram os mais capturados: o DeepSeek nunca rodou nada.
- `small` agora exige tier 3, escopo de arquivos declarado (`files.length >= 1`) e ausência de `CHEAP`. Tarefa trivial com escopo pequeno continua no principal; escopo desconhecido passa a ser delegado em vez de retido.
- Tokens curtos das regexes de risco casavam por substring dentro de palavras comuns em PT-BR e forçavam TIER 0 → principal **com `audit_required` falso**: `role` em "cont**role**", `drop` em "**drop**down", `secret` em "**secret**aria", `fix` em "**fix**tures", `api` em "r**api**dez", `test` em "**test**emunho". Num SaaS de domínio (estoque, produção, controle) isso capturava boa parte das tarefas do dia a dia. Todos ancorados em `\b` com a morfologia PT/EN aceita.
- `produção` sozinha deixou de ser domínio crítico: é vocabulário de negócio (linha/ordem de produção) e só conta como ambiente quando qualificada — `em produção`, `ambiente/banco/base/servidor/dados de produção` ou `production`/`prod` em inglês. Antes "criar ordem de produção" virava TIER 0 e "criar ordem de producao" (sem cedilha) virava TIER 1, resultado inconsistente para a mesma intenção.

### Alterado
- Skill `route`: o TASK PACKAGE com `allowed_files` passa a ser escrito **antes** da classificação, porque é ele que dimensiona a tarefa. `--objective` sozinho vira checagem solta.
- Skill `route` etapa 2: removida a válvula "delegue só com ganho real", que permitia reter no principal uma tarefa já classificada como `codex`/`deepseek`. Com veredito de worker, delegar não é opcional — só `status: blocked` ou ordem explícita do usuário mantêm a tarefa no principal.
- Skill `dry-run`: avisa que sem `allowed_files` o veredito não reflete o que o `route` faria.

## 1.2.1 — 2026-09-17
Auditoria de módulo acionável pelo router.

### Corrigido
- Etapa 4 da skill `route`: com `audit_required: true`, o Claude invoca a skill `saas-audit-br:module` com `<módulo> --fix`. Antes a skill mandava usar `/saas-audit-br:module`, que era manual (`disable-model-invocation`) e não podia ser chamada pelo modelo — a auditoria externa nunca rodava. Requer `saas-audit-br` 1.1.0.

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
