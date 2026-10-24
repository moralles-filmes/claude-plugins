---
name: aplicar
description: Instala, audita ou atualiza o Padrão SaaS v3.2 num repositório — AGENTS.md/CLAUDE.md enxutos, docs/standards normativos com manifest, regras por caminho, AGENTS.md aninhados para o Codex, permissões do Claude Code e o modelo de acesso (empresas, filiais, papéis e permissões por módulo/submódulo). Use quando o usuário pedir para aplicar, instalar, atualizar ou auditar o "padrão SaaS", inicializar o contexto de agentes de um projeto, reorganizar CLAUDE.md/AGENTS.md, ou implantar o controle de acesso por empresa/filial/módulo. Não use em tarefas comuns de código; para criar um módulo use padrao-saas:novo-modulo e, para mudança em várias camadas, padrao-saas:mudanca.
---

# Padrão SaaS v3.2 — aplicar num projeto

Você vai instalar ou alinhar o Padrão SaaS num repositório **sem reescrever o produto**. O resultado é uma camada de contexto que permite a qualquer agente (Claude Code ou Codex) trabalhar com segurança lendo só o necessário, e um plano para o modelo de acesso.

Arquivos desta skill (caminhos relativos a esta pasta):

```text
assets/repo/                    espelho da raiz de um projeto; copie daqui
  AGENTS.md  CLAUDE.md
  .claude/settings.json         deny/ask sem MCP (os de MCP estão em templates/settings/)
  .claude/tenancy-profile.yml   contrato de tenancy e acesso (lido também pelos plugins shield/builder/audit)
  .claude/rules/*.md            regras por caminho (só o Claude Code lê)
  supabase/AGENTS.md            as mesmas regras para o Codex (gerado)
  .claude/padrao.json           padrões opcionais não adotados (com motivo) e exceções de portabilidade
  scripts/check-padrao.mjs      verificação do padrão para o CI
  scripts/check-portabilidade.mjs  verificação de portabilidade para o CI (GCP_MIGRATION §6)
  scripts/security/             cópia do saas-shield-br (não edite aqui): secret-scan.mjs (staged, histórico,
                                pré-push), deps-audit.mjs (lockfiles, audit prod × dev, watchlist, Node), padrões
  .githooks/pre-commit|pre-push  secret-scan para quem commita fora do Claude (terminal, IDE, Codex)
  .github/workflows/ci.yml        CI do PR: lint, typecheck, testes, build, padrão, banco local + pgTAP (avisa o que falta)
  .github/workflows/security.yml  deps-audit + secret-scan --history + Semgrep no PR, na main e toda semana
  .github/workflows/auditoria.yml  /saas-audit-br:audit --ci agendado (só leitura; P0 novo reprova a execução)
  .github/dependabot.yml        npm com cooldown + github-actions
  docs/standards/*.md           13 padrões normativos + .manifest.json (lista os obrigatórios e os opcionais)
  docs/modules|adr|runbooks/    modelos
  docs/integrations/providers/  _TEMPLATE, meta, zapi
templates/sql/                  modelo de acesso testado nos adapters Supabase e Postgres puro:
                                00 adapter de identidade (supabase | postgres), 01 núcleo, 02 exemplo de módulo,
                                03 testes pgTAP do núcleo, 04 testes do adapter Supabase
templates/settings/             regras ask dos MCPs Supabase e Vercel
```

## 1. Limites desta execução

- Não altere comportamento funcional, não faça deploy, não aplique migration em ambiente remoto, não faça push. A entrega é a camada de contexto mais um diagnóstico e um plano; mudança de código e de banco vem depois, com aprovação.
- Rode `git status` antes de tudo. Trabalhe numa branch nova (`chore/padrao-saas`), preserve trabalho não commitado de terceiros e faça commits locais pequenos.
- Produção é somente leitura. Se houver Supabase MCP ou CLI ligado a produção, use apenas leitura.
- Classifique cada afirmação do diagnóstico como **CONFIRMADO**, **INFERIDO** ou **NÃO CONFIRMADO**. Não invente tabela, endpoint, comando ou regra de negócio.

## 2. Determine o modo

- **A — existente e funcional:** preserve comportamento, adapte o padrão às estruturas existentes, evolua por estrangulamento gradual. O arquétipo de tenant atual é mantido e declarado.
- **B — novo ou vazio:** instale o kit e construa só o que o nível de maturidade exige. O modelo de acesso é o arquétipo E (templates/sql).
- **C — em migração:** registre fonte da verdade, compatibilidade, rollback e critério para remover o legado.

## 3. Auditoria proporcional

Registre em `.tasks/padrao-saas/AUDIT.md`:

1. Produto, usuários, criticidade (dinheiro? mensagens a clientes finais? dados pessoais?).
2. Stack e versões **instaladas** (lockfile), package manager, runtime de servidor (Next ou Vite + Edge Functions), comandos reais de lint, typecheck, teste e build.
3. **Modelo de acesso atual:**
   - coluna de tenant, tabela de membership, se o usuário pode estar em várias empresas;
   - se existe filial/unidade e como ela aparece nas tabelas;
   - como a permissão é representada hoje (papel textual, níveis, permissões por módulo, nada);
   - de onde vem a empresa ativa (claim do JWT, URL, estado do cliente);
   - se `.claude/tenancy-profile.yml` existe. Se não, detecte como a skill `tenant-model` do saas-shield-br descreve e proponha o arquivo.
4. **Exposição de segredos (antes de qualquer outra coisa):** `.gitignore` cobre `.env*` (menos o `.env.example`), chaves, dumps e o estado das ferramentas (`.tasks/`, `.saas-audit/`, `.turbo/`, `.ai-router/`); `.env.example` sem valores; nenhum arquivo com segredo rastreado agora (`git ls-files` com os padrões de `saas-shield-br:secret-scanner`) nem no histórico. Execute a varredura do histórico, não só a leitura do working tree: `node assets/repo/scripts/security/secret-scan.mjs --history --repo <projeto>` (caminho relativo a esta skill; com o saas-shield-br instalado, `/saas-shield-br:secret-scan` faz o mesmo e mais). Clone raso dá INCONCLUSIVO: peça `git fetch --unshallow`. `.env*` versionado só passa com variáveis públicas (critério do `env-public.mjs`). **Achou segredo versionado: pare a auditoria e informe** — ele é P0, a rotação no provedor vem antes de limpar o histórico (runbook do saas-shield-br), e o valor nunca aparece no relatório.
5. **Dependências e runtime:** `node assets/repo/scripts/security/deps-audit.mjs --root <projeto>` (ou `/saas-shield-br:deps-audit`). Registre o veredito, os P0/P1 (Next, React RSC, sharp, postcss, zod 3, xlsx do npm, react-router 6, Node em fim de vida, lockfiles duplicados) e as correções que exigem major como decisão do usuário. INCONCLUSIVO (sem rede, sem lockfile) também vai para o relatório.
6. Supabase, se usado: RLS habilitada e forçada em toda tabela de schema exposto; `with check` em insert/update; grants de `anon`/`authenticated`; views sem `security_invoker`; `security definer` sem `search_path`; funções executáveis por `PUBLIC`; uso da service role; FKs sem composição de tenant. Se disponível, rode os Advisors.
7. Mutações críticas feitas direto do browser.
8. Integrações: provedores, credenciais, webhooks (verificação? dedup?), efeito externo (idempotência?), runner assíncrono, segredos no escopo Preview da Vercel.
9. MCP: servidores do produto e dos agentes (Supabase MCP com escrita em produção é P0).
10. Instruções de agentes: CLAUDE.md, AGENTS.md, `.claude/rules/`, AGENTS.md aninhados, `AGENTS.override.md`, bloco do ai-router-br. Não altere configurações pessoais ou globais do usuário.
11. CI, testes, observabilidade, backups (PITR? Storage?). O CI instala com `--ignore-scripts`, fixa actions por SHA e roda um audit de dependências agendado? Os testes de isolamento (pgTAP) rodam em todo PR? Há análise estática (SAST)?
12. Divergências entre documentação e código.

Se o plugin **saas-audit-br** estiver instalado e o projeto for grande, use `/saas-audit-br:audit --audit-only` para a varredura profunda de segurança e código e traga o resumo para cá, em vez de repetir o trabalho.

## 4. Instale a camada de contexto

### 4.1 Copiar, não parafrasear

Copie `docs/standards/*.md` **literalmente**, junto com `docs/standards/.manifest.json`. Adaptações ao projeto vão somente na seção final "Particularidades deste projeto" de cada um. O `scripts/check-padrao.mjs` acusa edição no corpo.

| Padrão | Copiar quando |
|---|---|
| ARCHITECTURE, SECURITY, TESTING, OPERATIONS, MODULES, GCP_MIGRATION | sempre (obrigatórios no manifest) |
| MULTI_TENANCY, ACCESS_CONTROL, TENANT_LIFECYCLE | o produto atende mais de uma empresa |
| DATABASE | há banco relacional |
| INTEGRATIONS | há ou haverá API externa, webhook, OAuth, e-mail, pagamento, IA com ferramentas ou MCP |
| PUBLIC_API | o produto expõe API ou chaves aos clientes |
| PERFORMANCE | há frontend ou API com usuários reais |

Padrão opcional que não se aplica **não** é copiado e vai em `.claude/padrao.json`, com motivo objetivo:

```json
{ "nao_adotados": { "PUBLIC_API.md": "o produto não emite chaves de API para clientes" } }
```

O `check-padrao.mjs` falha se um padrão do manifest sumir sem essa declaração, ou se um obrigatório for declarado.

Provider docs: copie `meta.md` e `zapi.md` só se o projeto usa esses provedores; para outros, crie a partir de `_TEMPLATE.md` com o que foi verificado na documentação oficial.

Copie também `docs/modules/_TEMPLATE.md`, `docs/adr/_TEMPLATE.md`, `docs/runbooks/_TEMPLATE.md`, `docs/runbooks/MAINTENANCE.md`, `scripts/check-padrao.mjs`, `scripts/check-portabilidade.mjs`, a pasta `scripts/security/` inteira (sem editar: é cópia do saas-shield-br; atualize copiando de novo) e `.githooks/pre-commit` + `.githooks/pre-push`. Proponha ao usuário ativar os hooks com `git config core.hooksPath .githooks` (configuração local do repositório; peça autorização). Acrescente ao `.gitignore`, sem reescrever o arquivo: `.tasks/` e o estado das outras ferramentas (`.saas-audit/`, `.turbo/`, `.ai-router/`, `.code-health/`, `.deps-audit/`), mais o que faltar de `.env*` (menos `.env.example`), chaves e dumps apontados na auditoria.

### 4.2 Projeto novo (modo B)

1. Copie `AGENTS.md`, `CLAUDE.md`, `.claude/` e o restante de 4.1.
2. Preencha os marcadores `{{...}}` do AGENTS.md e do CLAUDE.md com fatos confirmados. Remova o que não se aplica; não deixe marcador vazio.
3. Preencha `.claude/tenancy-profile.yml` (arquétipo E; `framework`, `client_env_prefix` e `secrets_boundary` conforme o runtime; `locations.enabled` conforme o produto).
4. Ajuste os `paths` de `.claude/rules/*.md` à estrutura real e rode `node scripts/check-padrao.mjs --write-nested`.

### 4.3 Projeto existente (modo A/C)

1. Inventarie CLAUDE.md/AGENTS.md e classifique cada trecho: regra global durável → AGENTS.md; detalhe de um assunto → "Particularidades" do padrão ou `docs/modules/<modulo>.md`; histórico ou plano → `.tasks/` ou descarte.
   Faça o mesmo com versões anteriores do padrão no projeto: cópias de `02_PROMPT_MESTRE_ARQUITETURA_SAAS_CLAUDE_CODEX.md`, `03_PADRAO_UNIVERSAL_INTEGRACOES_API_WEBHOOK_MCP.md` ou de `docs/standards/` v3.0. O que for específico do projeto vai para "Particularidades"; o resto é substituído pelo kit. Proponha a remoção dos arquivos antigos no plano e só remova com aprovação.
2. Não apague regra crítica ou armadilha confirmada. Se a reorganização mover muito conteúdo, **mostre o plano e espere aprovação**.
3. Regra existente que conflita com o padrão vira divergência no relatório, com pergunta. Não sobrescreva em silêncio.
4. AGENTS.md vira a fonte única; CLAUDE.md passa a `@AGENTS.md` mais o específico do Claude Code. Se houver o bloco `ai-router-br` nos dois, mantenha só no AGENTS.md (o ai-router-br ≥ 1.3.4 faz isso sozinho).
5. Declare o arquétipo atual no `.claude/tenancy-profile.yml` (A–D, ou E se já for o modelo do padrão). Não proponha trocar de arquétipo nesta execução; isso é projeto com ADR.
6. Rode `node scripts/check-portabilidade.mjs --json` e registre no AUDIT.md o total por regra e os módulos com mais acesso direto ao Supabase. Grave a linha de base (`--write-baseline`) para o CI barrar só dívida nova. Não refatore nesta execução: a redução da linha de base entra no plano, módulo a módulo, começando pelos módulos que já vão ser alterados.

### 4.4 Permissões do Claude Code

Faça merge do `.claude/settings.json`:

- nunca remova regras `deny`/`ask` já existentes;
- acrescente as regras de `templates/settings/mcp-*.json` **somente** dos servidores MCP configurados no ambiente, com o nome real do servidor (`mcp__<servidor>__<ferramenta>`). Regra para ferramenta inexistente gera aviso na inicialização.

### 4.5 Codex

O Codex lê AGENTS.md na raiz e em subdiretórios, mais instruções globais e `AGENTS.override.md`, e não lê `.claude/rules/`. Portanto:

- mantenha os AGENTS.md aninhados gerados pelo script (`supabase/AGENTS.md`; outros alvos em `.claude/nested-agents.json`, por exemplo `app/api/AGENTS.md`);
- verifique overrides que contradizem o padrão;
- mantenha o AGENTS.md raiz abaixo de 200 linhas e não altere a configuração global do usuário.

## 5. Modelo de acesso

Leia `assets/repo/docs/standards/ACCESS_CONTROL.md` antes desta etapa.

- **Modo B:** proponha no plano a Fase 1 = gerar as migrations a partir de `templates/sql/00_identidade_supabase.sql` (adapter) e `01_modelo_de_acesso.sql` (núcleo) com o catálogo real de módulos do produto, copiar `03_modelo_de_acesso.test.sql` e `04_identidade_supabase.test.sql` para `supabase/tests/database/` adaptados, e rodar `supabase test db` localmente. O `02_exemplo_modulo_financeiro.sql` é referência para os módulos, não migration.
- **Modo A/C:** faça a análise de lacunas entre o modelo atual e ACCESS_CONTROL (filial, usuário em várias empresas, permissões por submódulo, módulos contratados, anti-escalada, empresa ativa na URL, FK composta). Inclua a identidade portável: quantas policies e funções chamam `auth.uid()` direto, quantas FKs apontam para `auth.users`, e se as tabelas dependem dos default privileges do Supabase. Proponha o caminho expand → backfill → contract com riscos e rollback (primeiro `private.current_user_id()` e `public.app_users` com backfill; depois as policies e FKs, por módulo). Não gere migration nesta execução.

Em ambos, confirme com o usuário a árvore de módulos, submódulos e ações e os papéis de sistema antes de escrever o catálogo. Não invente módulo.

## 6. Nível de maturidade

Proponha o nível e registre no AGENTS.md depois da aprovação:

- **N1 — Base:** todo projeto com usuários reais.
- **N2 — Operação crítica:** dinheiro, mensagens em volume, integrações com efeito externo recorrente, clientes que dependem de disponibilidade.
- **N3 — Escala:** necessidade medida ou exigência contratual.

O nível decide **quanta infraestrutura construir**. Ele nunca dispensa os controles N1 de um fluxo que já existe.

## 7. Quality gates

Os três workflows do kit são os mesmos do `devops-ci` do saas-builder-br (o `validate.mjs` do marketplace confere). Instale com o aceite do usuário, em commit local na branch desta execução.

**CI — `.github/workflows/ci.yml`.** Lockfile congelado sem install scripts, lint, typecheck, testes, build, `check-padrao`, `check-portabilidade` e o banco local: `supabase db reset`, `db lint`, `test db` com os testes de isolamento e os testes de integração.
- Adapte os comandos aos do AGENTS.md §7 (pnpm, nomes reais dos scripts). Etapa que o projeto ainda não tem vira PENDENTE no plano; não a remova em silêncio.
- Projeto que já tem CI: acrescente as etapas que faltam ao workflow existente, em vez de criar um segundo pipeline.
- Sem `supabase/config.toml` ou sem testes em `supabase/tests/`, o CI não reprova: avisa no PR. Em produto multiempresa, a falta do primeiro teste de isolamento é P1 e entra como primeira fase do plano (agente `qa-testes` do saas-builder-br; no modo B, os modelos `templates/sql/03` e `04`).
- Proponha também a geração e a conferência do tipo das permissões.

**Segurança contínua — `security.yml` e `dependabot.yml`.** Proponha copiar os dois: deps-audit, secret-scan --history e Semgrep (job `sast`, que começa só relatando) no PR, na main e toda semana, porque CVE novo aparece sem mudança de código. Proponha ligar push protection, Dependabot alerts e Dependabot security updates no GitHub, e instalar com `npm ci --ignore-scripts`.

**Auditoria agendada — `auditoria.yml`.** Proponha em produto N2 ou que movimenta dinheiro, pedidos ou dados de várias empresas. Roda `/saas-audit-br:audit --ci` toda semana (nos demais sistemas, mensal: cron `'7 6 1 * *'`), só lendo, e reprova a execução quando aparece P0 novo. Depende de dois passos do usuário: instalar o Claude GitHub App no repositório e criar o secret `CLAUDE_CODE_OAUTH_TOKEN` com `claude setup-token` (usa a assinatura do Claude, sem cobrança de API). Copie o arquivo só depois que o usuário confirmar o secret: sem ele, toda execução falha.

Não crie limite cego de tamanho que force a remoção de regra crítica.

## 8. Entrega

Entregue nesta ordem e **pare** antes de qualquer alteração funcional, migration, deploy ou mudança de produção:

1. Diagnóstico (modo, runtime, stack confirmada, arquétipo de tenant, nível proposto).
2. Arquivos criados ou ajustados, e o que foi movido de onde para onde.
3. **Exposição de segredos:** o que está rastreado ou no histórico (com o resultado do `secret-scan.mjs --history`), o que o `.gitignore` não cobria e o que foi corrigido. Nomeie o arquivo e o tipo de credencial, nunca o valor. Segredo encontrado é P0 e a rotação no provedor vem antes de limpar o histórico.
4. **Dependências e runtime:** veredito do `deps-audit.mjs`, P0/P1 com a correção, majors aguardando decisão (com plano), Node declarado × exigido.
5. Riscos em P0 · P1 · P2 · P3, cada um com evidência (arquivo:linha, consulta ou comando) e marcado CONFIRMADO/INFERIDO.
6. Lacunas por padrão: APLICÁVEL, NÃO APLICÁVEL (com justificativa) ou PENDENTE.
7. Lacunas do modelo de acesso (seção 5).
8. Divergências entre documentação e código.
9. Plano em fases, do maior risco para o menor, cada fase pequena e reversível.
10. O que **não** foi verificado e por quê.

## 9. Atualização de um projeto que já usa o padrão

1. Compare `docs/standards/.manifest.json` do projeto com o do kit (versão e hashes).
2. Rode `node scripts/check-padrao.mjs` **antes**. Se o corpo de algum padrão foi editado no projeto, pare e mostre a diferença: a edição vira "Particularidades", vira proposta para o kit, ou é descartada — decisão do usuário.
3. Substitua o corpo pelo do kit, preserve "Particularidades", copie o manifest novo e os padrões novos que se aplicam.
4. Faça merge de `.claude/settings.json`, `.claude/rules/` e do tenancy-profile preservando os ajustes locais; regenere os AGENTS.md aninhados.
5. Atualize o AGENTS.md só nas seções estruturais; mantenha os fatos do projeto.
6. Relate o que mudou entre as versões e quais regras novas geram lacunas no projeto.

**De 3.1 para 3.2:**

- `GCP_MIGRATION.md` passou a ser obrigatório: copie se faltar (o check falha sem ele).
- Padrão opcional não copiado precisa estar em `.claude/padrao.json` → `nao_adotados`, com motivo. Projetos que registravam isso só no AGENTS.md ("Padrões não adotados") passam a declarar no JSON.
- Copie `scripts/check-portabilidade.mjs`, rode e grave a linha de base; inclua os dois scripts no CI.
- SQL de referência: `auth.uid()` virou `private.current_user_id()` e as FKs de usuário apontam para `public.app_users`. Em projeto existente isso é **plano** (expand → backfill → contract), não migration nesta execução.
- `.claude/rules/banco-de-dados.md` ganhou as regras de grants explícitos e de `current_user_id()`: faça o merge e regenere os AGENTS.md aninhados.

**Plugin 3.3 (a norma continua v3.2; `docs/standards/` e manifest sem mudança):**

- AGENTS.md: o §8 ganhou a linha "Mudança em mais de uma camada ou em mais de 5 arquivos" e o §10 o critério de tarefa complexa e o trabalho em fases (PLAN.md + STATE.md, contexto limpo por fase). Faça o merge das duas seções preservando os fatos do projeto.

**Plugin 3.4 (a norma continua v3.2):**

- AGENTS.md: §5 ganhou a ordem de prioridade quando duas regras conflitam; §6 a regra de `.gitignore`, `.env.example` sem valor e segredo já versionado como P0; §9 a remoção de código obsoleto com checagem de referências indiretas; §10 o escopo fechado do executor. Faça o merge dessas quatro seções preservando os fatos do projeto.
- Rode a verificação de exposição de segredos (§3, item 4) também nos projetos que já usam o padrão: ela não existia nas versões anteriores.

**Plugin 3.5 (a norma continua v3.2):**

- Copie `scripts/security/`, `.githooks/` e, se o usuário aceitar, `.github/workflows/security.yml` e `.github/dependabot.yml`.
- AGENTS.md: §6 ganhou dependências (lockfile único, major = decisão) e o comando de histórico; §7 os comandos `deps` e `segredos`. Faça o merge preservando os fatos do projeto.
- `.claude/settings.json`: `ask` para instalar/atualizar pacote e para `npx`/`pnpm dlx`/`bunx`; `deny` de leitura/edição de `.env.prod`, `.env.preview`, `.env.backup` e `.npmrc`. Faça o merge.
- Rode a auditoria de dependências e runtime (§3, item 5) e a varredura do histórico também nos projetos que já usam o padrão.

**Plugin 3.6 (a norma continua v3.2):**

- `.github/workflows/ci.yml` (novo no kit): instale, ou acrescente ao CI existente as etapas que faltam (§7). Avisos de banco ausente ou de teste de isolamento ausente entram no plano.
- `security.yml` ganhou o job `sast` (Semgrep CE, só relata). Se o projeto não alterou o arquivo, substitua; senão, acrescente o job.
- `.github/workflows/auditoria.yml` (novo, opcional): proponha nos sistemas críticos, depois que o usuário criar o secret (§7).
- `docs/runbooks/MAINTENANCE.md`: calendário revisto (auditoria agendada, Semgrep, restauração mensal dos dados críticos, teste mensal dos alertas, privilégios e LGPD trimestrais, simulação de incidente semestral, versões fixas que o Dependabot não atualiza). Faça o merge preservando os responsáveis e o histórico do projeto.

## 10. Depois da instalação

Oriente o usuário a abrir uma sessão nova e rodar `/context` (CLAUDE.md, AGENTS.md e as rules em Memory files) e `/doctor`. Se o `/doctor` sugerir enxugar o AGENTS.md, as seções de segurança, acesso e invariantes ficam.
