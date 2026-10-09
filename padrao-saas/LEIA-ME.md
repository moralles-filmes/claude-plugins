# Padrão SaaS v3.2

Substitui o kit avulso v3.0 e, antes dele, o `02_PROMPT_MESTRE_ARQUITETURA_SAAS_CLAUDE_CODEX.md` e o `03_PADRAO_UNIVERSAL_INTEGRACOES_API_WEBHOOK_MCP.md`.

É a **norma** dos seus projetos SaaS. Os outros plugins deste repositório executam seguindo essa norma:

| Plugin | Papel |
|---|---|
| `padrao-saas` | Diz o que é certo e por quê |
| `saas-builder-br` | Constrói |
| `saas-shield-br`, `saas-audit-br`, `code-health` | Auditam |
| `turbo` | Otimiza |
| `ai-router-br` | Distribui o trabalho entre Claude, Codex e DeepSeek |

## O que tem no plugin

```text
padrao-saas/
  PROMPT_INICIAL.md              primeira mensagem em cada projeto (Claude Code ou Codex)
  skills/aplicar/                instala, audita ou atualiza o padrão num projeto
    SKILL.md
    assets/repo/                 espelho da raiz de um projeto; a skill copia daqui
      AGENTS.md  CLAUDE.md
      .claude/settings.json      bloqueios e confirmações (push, deploy, migration, .env, MCP)
      .claude/tenancy-profile.yml  modelo de tenant e de acesso do projeto
      .claude/rules/             regras carregadas por caminho de arquivo (Claude Code)
      supabase/AGENTS.md         as mesmas regras para o Codex (gerado)
      .claude/padrao.json        padrões opcionais não adotados (com motivo) e exceções de portabilidade
      scripts/check-padrao.mjs   verificação do padrão para o CI do projeto
      scripts/check-portabilidade.mjs  mede o acoplamento ao Supabase (CI barra dívida nova)
      docs/standards/            13 padrões + .manifest.json
        ARCHITECTURE  SECURITY  MULTI_TENANCY  ACCESS_CONTROL  DATABASE  INTEGRATIONS
        PUBLIC_API  TENANT_LIFECYCLE  MODULES  PERFORMANCE  TESTING  OPERATIONS  GCP_MIGRATION
      docs/modules/_TEMPLATE.md  docs/adr/_TEMPLATE.md  docs/runbooks/{_TEMPLATE,MAINTENANCE}.md
      docs/integrations/providers/  _TEMPLATE, meta, zapi
    templates/sql/               modelo de acesso testado nos adapters Supabase e Postgres puro
                                 (00 identidade, 01 núcleo, 02 exemplo de módulo, 03–04 testes pgTAP)
  tests/                         testes do kit: check-padrao, check-portabilidade e SQL (pgTAP)
    templates/settings/          regras dos MCPs Supabase e Vercel
  skills/novo-modulo/            cria, amplia ou remove um módulo, com Definition of Done
```

`.claude` é uma pasta oculta. No macOS, `Cmd+Shift+.` no Finder mostra.

## Instalação (uma vez por máquina)

Depois que este repositório estiver atualizado no GitHub:

```powershell
.\setup-claude.ps1          # Windows, na pasta do clone
```
```bash
./setup-claude.sh           # macOS / Linux
```

O setup instala todos os plugins do `marketplace.json`, inclusive o `padrao-saas`. Reinicie o Claude Code e confira se `/padrao-saas:aplicar` aparece ao digitar `/`.

**Se você instalou a v3.0 à mão**, apague a cópia antiga para não ter duas skills com o mesmo propósito:

- Windows: `%USERPROFILE%\.claude\skills\padrao-saas\`
- macOS/Linux: `~/.claude/skills/padrao-saas/`

Apague também os arquivos `02_PROMPT_MESTRE…` e `03_PADRAO_UNIVERSAL…` de onde você os guarda. Cópias deles **dentro de projetos** a skill trata sozinha (próxima seção).

**Codex.** Não há plugin do padrão para o Codex. Ele lê o resultado (`AGENTS.md` na raiz e os aninhados). Para instalar o padrão num projeto pelo Codex, use o `PROMPT_INICIAL.md` trocando `<KIT>` pelo caminho do clone deste repositório.

## Uso em cada projeto

1. Abra o projeto e cole o [PROMPT_INICIAL.md](./PROMPT_INICIAL.md) como primeira mensagem.
2. O agente audita, instala a camada de contexto numa branch `chore/padrao-saas` e entrega diagnóstico, riscos P0–P3, lacunas do modelo de acesso, a árvore de módulos proposta e um plano em fases. Ele **para** antes de mexer em código, migration ou produção.
   - Projeto existente mantém o modelo de tenant atual e o declara no `.claude/tenancy-profile.yml`.
   - Cópias dos prompts antigos 02/03 e regras soltas em CLAUDE.md viram "Particularidades" dos padrões ou são removidas, com a sua aprovação.
3. Responda às dúvidas (regras de negócio, módulos, papéis) e aprove o nível de maturidade e o plano.
4. Peça uma fase por vez. Migrations primeiro no Supabase local, com `supabase test db` passando.
5. Abra uma sessão nova e rode `/context` (CLAUDE.md, AGENTS.md e as rules devem aparecer) e `/doctor`. Se o `/doctor` sugerir enxugar o AGENTS.md, as seções de segurança, acesso e invariantes ficam.
6. No CI do projeto, acrescente `node scripts/check-padrao.mjs`, `node scripts/check-portabilidade.mjs` e `supabase test db`. Em projeto existente, grave antes a linha de base da portabilidade (`--write-baseline`): o CI passa a barrar só dívida nova.

Para cada módulo novo: `/padrao-saas:novo-modulo`.

## Modelo de acesso, em uma tabela

O mesmo usuário pode ser membro de várias empresas, com papéis diferentes em cada uma. Dados operacionais pertencem à filial; cadastros compartilhados pertencem à empresa.

| Você quer | Concede |
|---|---|
| O módulo Financeiro inteiro, inclusive submódulos futuros | `financeiro` |
| Só Contas a Pagar, todas as ações | `financeiro.contas_pagar` |
| Só ver Contas a Pagar | `financeiro.contas_pagar.ver` |
| Contas a Pagar só na filial Centro | `financeiro.contas_pagar` com a filial Centro |

- Concessão por papel ou direto ao usuário; para a empresa inteira ou por filial.
- Concessões só somam; qualquer ação de um submódulo já dá direito de vê-lo.
- A empresa só acessa os módulos que contratou. Empresa inadimplente fica em só leitura.
- A empresa ativa vem da URL; duas abas em empresas diferentes funcionam.
- Ninguém altera o próprio acesso nem concede o que não tem.

Norma completa: `docs/standards/ACCESS_CONTROL.md`. Implementação: `skills/aplicar/templates/sql/`.

## Atualizando o padrão no futuro

1. Edite os padrões **aqui no plugin** (`skills/aplicar/assets/repo/docs/standards/`). Suba a versão no cabeçalho de todos (ex.: `Padrão SaaS v3.2`) e no `.claude-plugin/plugin.json`; registre no `CHANGELOG.md`.
2. Regere manifest e AGENTS aninhados:
   ```bash
   node padrao-saas/skills/aplicar/assets/repo/scripts/check-padrao.mjs \
     --root padrao-saas/skills/aplicar/assets/repo --write-manifest --write-nested
   ```
3. Rode `node scripts/validate.mjs` (ele reprova o push se o manifest do kit estiver velho).
4. Rode os testes do kit: `node --test padrao-saas/tests/*.test.mjs` e, com Postgres + pgTAP, `node padrao-saas/tests/run-sql-tests.mjs` (o `validate.mjs` já chama os dois; o CI roda o SQL com `--required`).
5. Commit, push e `setup-claude` nas máquinas. Em cada projeto: "atualize o padrão SaaS".

**Nunca edite o corpo de um padrão dentro de um projeto.** O `check-padrao.mjs` do projeto acusa; adaptações vão em "Particularidades deste projeto".

## O que mudou da v3.1 para a v3.2

| Mudança | Onde |
|---|---|
| `check-padrao` confere manifest ↔ padrões nos dois sentidos: padrão apagado não passa mais em silêncio | scripts/check-padrao.mjs |
| Padrões obrigatórios × opcionais no manifest; opcional não adotado é declarado com motivo em `.claude/padrao.json` | .manifest.json, skill aplicar §4.1 |
| Portabilidade obrigatória desde o N1 (`GCP_MIGRATION` não pode ser "não adotado"); a migração continua só com gatilho | GCP_MIGRATION §1 |
| `check-portabilidade.mjs`: SDK/cliente Supabase e `.from()`/`.rpc()` fora dos adapters, `Deno.*` fora do entrypoint, empresa lida do token; linha de base para projeto legado | GCP_MIGRATION §6, TESTING §5 |
| A tela chama só o adapter do módulo (`features/<m>/api.ts`) | ARCHITECTURE §2–3, AGENTS §3, MODULES §5 |
| Identidade portável: `private.current_user_id()` no lugar de `auth.uid()`, FKs para `public.app_users`, adapters `00_identidade_supabase` e `00_identidade_postgres` | templates/sql, ACCESS_CONTROL §9, DATABASE §4–5 |
| SQL de referência testado nos dois adapters (33 + 5 cenários) e grants explícitos (não depende dos default privileges do Supabase) | templates/sql, tests/run-sql-tests.mjs |
| Testes automatizados do kit no CI do repositório | tests/, scripts/validate.mjs |

Nos outros plugins, na mesma entrega: `saas-builder-br` 1.5.0 gera no arquétipo E (empresa ativa na URL, filtro por empresa em toda query de tela, tela → `api.ts`, transição crítica por RPC, tokens no Vault, deploy de produção só com aprovação) e usa os templates do shield em vez de cópias próprias; `saas-shield-br` 2.4.0 tem o gerador único de migrations, Edge Function e `vercel.json` canônicos, hooks corrigidos e testados (commit composto, JWT `service_role` de verdade, `sb_secret_`, PowerShell) e instruções de `db push` corrigidas; `saas-audit-br` 1.3.0 só audita por padrão, roda cada checagem de RLS uma vez e mede portabilidade; `code-health` 0.4.0 trata buckets do Storage, sai do `/tmp` e do gawk; `turbo` 1.0.4 corrige a porta do pooler (6543) e o conselho de claim no JWT.

## O que mudou da v3.0 para a v3.1

| Mudança | Onde |
|---|---|
| Modelo de acesso: empresa → filial, usuário em várias empresas, papéis por empresa, concessões diretas, permissões por módulo/submódulo/ação, módulos contratados, status só leitura/suspensa | ACCESS_CONTROL, templates/sql |
| Tenancy declarada no `.claude/tenancy-profile.yml`, compatível com o saas-shield-br (arquétipo E); empresa ativa na URL | MULTI_TENANCY, AGENTS.md §4 |
| Criar, alterar e remover módulo, com Definition of Done | MODULES, skill novo-modulo |
| Provisionamento, planos, cobrança da assinatura, suspensão, exportação, exclusão | TENANT_LIFECYCLE |
| Chaves de API emitidas para os clientes | PUBLIC_API |
| Manifest com hash dos padrões e verificação no CI | scripts/check-padrao.mjs |
| Regras do Claude Code também para o Codex | supabase/AGENTS.md |
| Variante Vite (Edge Functions/RPC como servidor) | ARCHITECTURE §2–3, GCP §6 |
| settings.json: `.env` em subpastas, chaves, service accounts, `npx`/`pnpm dlx`/`bunx`, descarte de trabalho, `gh`, `psql`, `gcloud`, `terraform`; MCP em fragmentos | .claude/settings.json, templates/settings |
| Commit local liberado; push, merge e descarte pedem confirmação | OPERATIONS §1 |
| Previews nunca disparam efeito real | AGENTS §6, TESTING §4, OPERATIONS §2 |
| FORCE RLS com checagem de BYPASSRLS; idempotência devolve o resultado original; limpeza de tabelas técnicas | DATABASE §1, §4, §5, §10 |
| Falha silenciosa, manutenção contínua, upgrade de plataforma | OPERATIONS §4, §8, §9 |
| Supabase Auth, CAPTCHA, MFA, CSP/CORS, acesso de suporte, audit log, IA com fallback seguro | SECURITY §3, §4, §8.1, §9 |
| `/doctor prompt-audit` (não existe) trocado por `/doctor` | skill aplicar §10 |
| Severidade P0–P3, igual à do shield e do audit | AGENTS §11 |

Nos outros plugins: `ai-router-br` 1.3.4 não duplica o bloco quando o CLAUDE.md importa `@AGENTS.md`; `saas-audit-br` 1.2.2 grava só no AGENTS.md; `saas-builder-br` 1.4.0 usa o padrão como norma e corrige retry e fallback; `saas-shield-br` 2.3.0 conhece o arquétipo E e checa FK composta.

## Limites que você deve conhecer

- **SQL de referência:** 33 testes pgTAP do núcleo passando em Postgres 16 nos dois adapters (stub do Supabase com os default privileges, e Postgres puro), mais 5 do adapter Supabase. A v3.1 também mediu `EXPLAIN` com 100 mil linhas. Ainda não rodou num Supabase real: no primeiro projeto, rode `supabase test db` antes de qualquer outra coisa. Exige Postgres 15+.
- **check-portabilidade** é análise de texto (imports e chamadas), não de tipos: um cliente Supabase guardado em variável com outro nome e usado sem `.from()`/`.rpc()` passa despercebido. Ele mede a tendência; a revisão humana continua.
- **settings.json** é aplicado pelo Claude Code, mas regras de leitura de arquivo não cobrem todo comando de shell. A proteção real é não ter segredo de produção na máquina de desenvolvimento.
- **Provider docs da Meta e da Z-API** têm itens **[verificar]**: confirme na documentação vigente na primeira integração de cada projeto.
- **Exemplos de SQL e TypeScript** são ilustrativos: o agente adapta ao esquema real, não aplica em massa.
- **Sem jurídico.** As regras de LGPD e de nota fiscal são requisitos de engenharia, não parecer.
