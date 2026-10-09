---
name: aplicar
description: Instala, audita ou atualiza o Padrão SaaS v3.2 num repositório — AGENTS.md/CLAUDE.md enxutos, docs/standards normativos com manifest, regras por caminho, AGENTS.md aninhados para o Codex, permissões do Claude Code e o modelo de acesso (empresas, filiais, papéis e permissões por módulo/submódulo). Use quando o usuário pedir para aplicar, instalar, atualizar ou auditar o "padrão SaaS", inicializar o contexto de agentes de um projeto, reorganizar CLAUDE.md/AGENTS.md, ou implantar o controle de acesso por empresa/filial/módulo. Não use em tarefas comuns de código; para criar um módulo use padrao-saas:novo-modulo.
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
4. Supabase, se usado: RLS habilitada e forçada em toda tabela de schema exposto; `with check` em insert/update; grants de `anon`/`authenticated`; views sem `security_invoker`; `security definer` sem `search_path`; funções executáveis por `PUBLIC`; uso da service role; FKs sem composição de tenant. Se disponível, rode os Advisors.
5. Mutações críticas feitas direto do browser.
6. Integrações: provedores, credenciais, webhooks (verificação? dedup?), efeito externo (idempotência?), runner assíncrono, segredos no escopo Preview da Vercel.
7. MCP: servidores do produto e dos agentes (Supabase MCP com escrita em produção é P0).
8. Instruções de agentes: CLAUDE.md, AGENTS.md, `.claude/rules/`, AGENTS.md aninhados, `AGENTS.override.md`, bloco do ai-router-br. Não altere configurações pessoais ou globais do usuário.
9. CI, testes, observabilidade, backups (PITR? Storage?).
10. Divergências entre documentação e código.

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

Copie também `docs/modules/_TEMPLATE.md`, `docs/adr/_TEMPLATE.md`, `docs/runbooks/_TEMPLATE.md`, `docs/runbooks/MAINTENANCE.md`, `scripts/check-padrao.mjs` e `scripts/check-portabilidade.mjs`. Acrescente `.tasks/` ao `.gitignore` (sem reescrever o arquivo).

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

## 7. Quality gates (propor, não forçar)

Se o projeto tem CI, proponha: `node scripts/check-padrao.mjs`, `node scripts/check-portabilidade.mjs` (com linha de base em projeto legado), secret scan, lint, typecheck, testes, `supabase test db` com os testes de isolamento, e geração e conferência do tipo das permissões. Não crie limite cego de tamanho que force a remoção de regra crítica.

## 8. Entrega

Entregue nesta ordem e **pare** antes de qualquer alteração funcional, migration, deploy ou mudança de produção:

1. Diagnóstico (modo, runtime, stack confirmada, arquétipo de tenant, nível proposto).
2. Arquivos criados ou ajustados, e o que foi movido de onde para onde.
3. Riscos em P0 · P1 · P2 · P3, cada um com evidência (arquivo:linha, consulta ou comando) e marcado CONFIRMADO/INFERIDO.
4. Lacunas por padrão: APLICÁVEL, NÃO APLICÁVEL (com justificativa) ou PENDENTE.
5. Lacunas do modelo de acesso (seção 5).
6. Divergências entre documentação e código.
7. Plano em fases, do maior risco para o menor, cada fase pequena e reversível.
8. O que **não** foi verificado e por quê.

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

## 10. Depois da instalação

Oriente o usuário a abrir uma sessão nova e rodar `/context` (CLAUDE.md, AGENTS.md e as rules em Memory files) e `/doctor`. Se o `/doctor` sugerir enxugar o AGENTS.md, as seções de segurança, acesso e invariantes ficam.
