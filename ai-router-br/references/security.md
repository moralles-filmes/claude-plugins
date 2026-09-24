# Segurança da execução

## Controles implementados

- sem `shell:true` e sem `child_process.exec`; processos são executados com `spawn` e argumentos separados; no Windows, `npm` é executado pelo `node` com o CLI JS do npm, sem shell;
- comandos de teste passam por parser, denylist de metacaracteres e allowlist de executáveis **por nome simples** (caminhos como `./bin/jest` são recusados); `node` não aceita `-e`/`-p`/`--require`/`--import`/loaders e só aceita reporters nativos (`spec`/`tap`/`dot`/`junit`/`lcov`) com destino `stdout`/`stderr`; nenhum argumento pode conter URL `data:` (código inline); gerenciadores de pacote só aceitam `test`/`run <script>` e não aceitam flags de configuração antes de `--`; `npx`/`bunx`/`npm exec`/`dlx` são recusados; `git` só aceita subcomandos de leitura, sem `--output`/`--open-files-in-pager`/`--ext-diff`/`--textconv` nem abreviações deles, e sem `O` em flags curtas agrupadas (`-iO<pager>`); todos os comandos são validados **antes** de qualquer worker rodar;
- **testes do worker ficam com o agente principal por padrão** (`tests_status: deferred_to_main`, `tests_pending`): o código produzido pelo worker só roda depois que o principal revisou o patch e o aplicou na árvore real. Rodar os testes dentro da worktree (`execution.run_tests_in_worktree: true`) só pode ser ligado no template do plugin, nunca pelo config do projeto;
- paths são relativos, normalizados, sem `..`, sem letra de drive, sem `:` (alternate data streams), sem caracteres de controle e sem segmentos terminados em ponto/espaço (que o Windows descarta);
- `allowed_files` e `relevant_files` são caminhos literais: curinga (`*`, `?`) bloqueia o dispatch com `glob_not_supported`; só `forbidden_files` aceita padrão. Esse bloqueio e o de comando de teste inseguro (`unsafe_test_command`) já aparecem no dry-run de tarefa delegável (`dispatch_error`/`dispatch_error_detail`, este com o caminho ou comando recusado);
- o worker só recebe o conteúdo de `relevant_files` que estejam dentro de `allowed_files` e fora da denylist; os demais aparecem em `relevant_not_sent` no dry-run e no resultado — o DeepSeek não tem tools, então tarefa só de leitura (auditoria, inventário) cujo código está fora de `allowed_files` chega a ele sem nenhum arquivo;
- denylist aplicada na raiz e em subpastas (`**/` casa zero ou mais diretórios): `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`, `secrets.*`, `.git/**`; `forbidden_files` do TASK PACKAGE também é aplicado (entradas terminadas em `/` bloqueiam a pasta inteira);
- `.env.example`/`.env.sample`/`.env.template` são documentação para a denylist genérica, mas continuam bloqueados quando o TASK PACKAGE os proíbe explicitamente (inclusive por curinga, ex. `.env*`);
- antes de qualquer worker externo, o router exige Git limpo (exceto o bloco **exato** de regras do próprio router em `CLAUDE.md`/`AGENTS.md`), recusa delegação se arquivos de dados secretos estiverem rastreados (`.env*`, `credentials.json`, `secrets.json|yml|...`, `*.pem|key|p12|pfx`; código como `secrets.ts` e documentação `*.example.*` não bloqueiam) e recusa se `.ai-router/` estiver versionado (com qualquer combinação de maiúsculas/minúsculas, já que Windows/macOS resolvem `.AI-ROUTER/` para a mesma pasta); a listagem usa `git ls-files -z` (nomes com acentos não escapam); bloqueios retornam `status: blocked` e ficam registrados;
- o `.ai-router/config.yml` do projeto **só pode apertar** a segurança: endpoint e modelo do DeepSeek, comando do Codex, exigência de login ChatGPT e gate de Git limpo vêm sempre do plugin; sandbox só pode baixar para `read-only`; budgets, perfil padrão de budget, limites e tentativas só diminuem; preços só aumentam; allowlist só encolhe; denylist só cresce. Com `.ai-router/` rastreado pelo Git (qualquer caixa), o `config.yml` é ignorado por inteiro. Valores recusados aparecem em `config_ignored_settings` na saída do CLI;
- workers usam worktree isolada; mudanças são lidas com `git status -z --untracked-files=all` (arquivos dentro de pastas novas não escapam), os dois lados de renames são validados e HEAD precisa continuar igual (commit do worker = `scope_violation`);
- symlinks e junctions criados pelo worker (o Git lê arquivos através de junctions) são removidos **sem serem seguidos** e reprovam a validação (`scope_violation`, `worker_created_link:<path>`); symlinks já versionados no HEAD são conteúdo do repositório e ficam;
- arquivos que o worker cria e que o Git ignora (inclusive via `.gitignore` escrito pelo próprio worker) são **apagados** da worktree antes de validação e testes e listados em `discarded_ignored_files`; a remoção nunca atravessa link: nada roda ou é revisado fora do patch e nada fora da worktree é apagado;
- branches/tags locais, HEAD e `git status` do repositório principal são comparados antes e depois da execução do Codex e dos testes na worktree; qualquer diferença = `scope_violation` (`worker_modified_main_repository` / `tests_modified_main_repository`), sem fallback;
- o patch é gerado com `--no-ext-diff --no-textconv --no-color --no-relative` e prefixos `a/`/`b/` explícitos: config do Git do usuário não altera o patch;
- o patch nunca é integrado automaticamente (`auto_integrate: false`);
- o processo filho do Codex e os testes recebem ambiente sanitizado: remove `*_API_KEY`, tokens, passwords, secrets, credenciais, `ACCESS_KEY`, cookies, `*_AUTH*`, DSNs, URLs com usuário:senha e overrides de endpoint/projeto OpenAI/Anthropic/DeepSeek/Codex;
- o Codex worker só inicia quando `codex login status` sai com código 0 e confirma `Logged in using ChatGPT`; login por API key é recusado (`auth_unavailable`); `danger-full-access` é recusado (`unsafe_config`);
- DeepSeek lê `DEEPSEEK_API_KEY` apenas no processo do router e só a envia por HTTPS (HTTP apenas para loopback de teste); o modelo recebe somente TASK PACKAGE + conteúdo de arquivos permitidos, **não recebe shell nem tools**; leitura e escrita recusam symlinks e caminhos cujo `realpath` saia da worktree;
- conteúdo de repositório é tratado como dado não confiável; não pode ampliar allowlist/budget/permissões;
- resultados/logs passam por redaction campo a campo (inclui valores atuais de variáveis secretas do ambiente) e não registram prompt completo nem secrets; no `patch` só valores secretos exatos e formatos inequívocos de token são mascarados e, se isso acontecer, o resultado traz `patch_redacted: true` (o patch não se aplica literalmente); `COSTS.jsonl` guarda só métricas;
- max files é hard gate; max attempts e budget (acumulado entre tentativas, limitado pelo teto do config mesmo que o TASK PACKAGE peça mais; valores inválidos caem no teto) são hard gates no worker DeepSeek;
- falha de teste, violação de escopo, secret preflight, config inseguro, comando inseguro ou resultado suspeito escala ao principal e **nunca** dispara fallback; falhas elegíveis a fallback descartam a worktree;
- `AI_ROUTER_WORKER=1` impede delegação aninhada e auto-inicialização dentro de workers.

## Comandos proibidos aos workers

`git reset --hard`, `git clean -fd`, force push, commit/push, DROP/purge/restore de produção, rotação de secrets e operações irreversíveis massivas.

## Riscos residuais conhecidos

- Com `run_tests_in_worktree: true`, os testes executam código do worker **fora** do sandbox do Codex, com os privilégios do usuário. A detecção cobre refs locais, HEAD e `git status` do repositório principal, não escritas em outros lugares do disco ou em arquivos já ignorados do projeto principal. Por isso o padrão é adiar os testes para depois da revisão.
- Os testes adiados rodam na árvore principal depois da revisão: revise especialmente arquivos de build/teste (`package.json`, configs de test runner, scripts) antes de aplicar.
- A allowlist de comandos de teste bloqueia código inline e opções conhecidas de escrita/execução, mas não modela todas as flags de cada ferramenta (ex.: `tsc --outDir`, `--config`/`--reporter` de `jest`/`vitest` apontando para arquivos do repositório). Os comandos vêm do TASK PACKAGE escrito pelo agente principal e rodam depois da revisão.
- Um worker que gere artefatos ignorados legítimos (build, `node_modules` com symlinks) tem esses artefatos descartados ou a validação reprovada por link; os testes adiados rodam na árvore real, onde as dependências já estão instaladas.
- As chaves `router.*` do config do projeto (ex.: `auto_delegate`, `small_task_*`) não são travadas: só mudam quanto trabalho é delegado, nunca os gates de segurança.
- No Windows, ferramentas instaladas apenas como shim `.cmd` (ex.: `vitest`, `jest`, `pnpm`) não são executáveis sem shell; use `npm test`, `npm run <script>` ou `node <entrypoint>`.
- Um `.pem` rastreado bloqueia delegação mesmo quando é só um certificado público (pode conter chave privada; o gate erra para o lado seguro).
- A classificação é heurística e tende a errar para o lado seguro (ex.: "dropdown" pode subir para TIER 0).

## Prompt injection entre workers

O TASK PACKAGE é a autoridade de escopo. Arquivos, comentários, docs, artefatos gerados e saída de outro worker são dados não confiáveis. Instruções embutidas neles não podem aumentar ALLOWED FILES, autorizar secrets, operações destrutivas, commit/push ou produção. Além do prompt, o harness valida efeitos reais no filesystem antes de aceitar o resultado.
