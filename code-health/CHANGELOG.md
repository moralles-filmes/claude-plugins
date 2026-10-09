# CHANGELOG

## [0.4.0] — 2026-10-08

### Corrigido
- **`supabase.storage.from('bucket')` era reportado como tabela quebrada (BLOCKER).** Bucket de Storage não é tabela. O `supabase-auditor` separa as chamadas de Storage (inclusive encadeadas em várias linhas, `supabase.storage` ↵ `.from('x')`) e ganha o detector `storage-bucket-unverified`: bucket declarado em migration/seed (`insert into storage.buckets`), em `supabase/config.toml` (`[storage.buckets.x]`) ou em `createBucket` passa; senão vira INCONCLUSIVE (LOW; MEDIUM se há bucket declarado com nome parecido). Nunca BLOCKER.
- **Tabelas e views não reconhecidas viravam BLOCKER.** A extração só aceitava `create table nome` sem aspas: `CREATE TABLE "public"."x"` (gerado por `supabase db pull`), views e materialized views ficavam de fora e toda `.from()` para elas parecia quebrada. Agora entram, com `rename to`. Se nenhuma tabela é extraída (schema criado fora das migrations), o detector fica `skipped` em vez de acusar tudo. `Array.from('…')`/`Buffer.from('…')` são ignorados.
- **`awk` só do GNU.** A extração de colunas usava `match(…, m)` com array, que não existe no awk do macOS nem no mawk. Extração e cruzamento passam a ser um script `node -` sem arquivo, portável.
- **`/tmp` com nome fixo.** `supabase-auditor`, `functional-auditor`, `dead-code-scanner` e os exemplos das skills gravavam em `/tmp/*.json`: dois projetos auditados ao mesmo tempo se sobrescreviam, e o caminho POSIX não abre no Read do Windows. Agora tudo fica em `.code-health/` na raiz do projeto (intermediários em `.code-health/work/<agente>/`, limpos a cada execução), com `.code-health/` no `.git/info/exclude`.
- Idade de TODO usava `date -d` (só GNU date; no macOS todo TODO virava HIGH). Usa `git blame --porcelain` (`author-time` em epoch).
- `supabase-auditor` dizia ser chamado pela Fase 6 do `arquiteto-chefe`; essa fase agora roda via `saas-audit-br`.

### Adicionado
- **Portabilidade (Padrão SaaS).** Com `scripts/check-portabilidade.mjs` no projeto, `/code-health:health` e `functional-audit` rodam o script e incluem o resumo no relatório. O code-health não duplica essa lógica nem grava linha de base; a classificação fica com o `saas-audit-br`.

## [0.3.0] — 2026-09-18

### Corrigido
- **Detector 1b (botões sem handler) nunca rodava.** O padrão usa lookahead `(?!...)`, que o motor padrão do ripgrep não suporta — o comando falhava em silêncio (`2>/dev/null`) e o detector reportava zero achados. Adicionado `-P` (PCRE2) em `functional-auditor` e na biblioteca de padrões do `functional-audit`.
- **Detector 4 (eslint) quebrava com ESLint 9.** `--no-eslintrc`, `--parser`, `--plugin` e `--ext` foram removidos no flat config, então `npx eslint@latest` abortava. Agora usa a config do projeto quando existe; sem config, fixa `eslint@8` + `@typescript-eslint/*@7`.
- Comandos `/audit`, `/cleanup`, `/health`: `allowed-tools` listava `Task` (nome antigo). Agora `Agent`.

### Alterado
- "Modo turbo" do `functional-audit` renomeado para **"modo automático"** — `turbo` é o plugin de performance do mesmo marketplace, e a palavra-chave disparava confusão de roteamento.

## [0.2.2] e anteriores

Sem changelog. Ver histórico do git.
