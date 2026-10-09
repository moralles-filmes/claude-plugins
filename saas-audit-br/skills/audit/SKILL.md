---
name: audit
description: Auditoria completa de um SaaS da descoberta à correção e regressão, orquestrando saas-shield-br, code-health e auditores complementares. Use manualmente para revisar o sistema inteiro.
argument-hint: "[--audit-only (padrão) | --fix | --full | --resume | --status]"
disable-model-invocation: true
---

# SaaS Audit — sistema completo

Argumentos: `$ARGUMENTS`

Modo:
- `--audit-only`: **padrão se nenhum modo for informado.** Audita, classifica e planeja; NÃO edita código de produto.
- `--fix`: só quando informado explicitamente. Audita e corrige P0/P1/P2 seguros, com testes.
- `--full`: só quando informado explicitamente. Igual a `--fix`, com varredura aprofundada, hardening P3 relevante e regressão ampliada.
- `--resume`: retoma `.saas-audit/STATE.md`.
- `--status`: apenas lê estado e resume; não executa auditoria.

Nunca deduza `--fix`/`--full` de um pedido vago ("audita o sistema", "dá uma olhada"). Grave o modo em `STATE.md` com a origem: `Mode: audit-only (default)` ou `Mode: fix (explicit)`.

Carregue as skills internas:
- `audit-state-protocol`
- `security-fix-protocol`

Use `ultrathink` na classificação, no plano e antes de uma correção P0.

## Princípio

Você é o ORQUESTRADOR. Não replique auditorias profundas que já pertencem a especialistas.

Plugins esperados:
1. `saas-shield-br` — segurança especializada.
2. `code-health` — saúde funcional/estrutural.

Se algum não estiver disponível:
- registre a ausência em `STATE.md`;
- continue com o que for possível;
- marque cobertura afetada como INCONCLUSIVE;
- nunca finja que um agente/plugin rodou.

## Fase 0 — status/resume

Se `--status`: leia `.saas-audit/STATE.md`, `FINDINGS.md`, `PLAN.md` e responda com fase, bloqueantes e próximo passo. Pare.

Se `--resume`: leia estado primeiro e continue da `Next` action. Não repita fases concluídas sem motivo.

Se `--fix`/`--full` for pedido sobre uma auditoria `audit-only` já concluída e o `HEAD` ainda for o `Baseline commit` gravado (sem mudanças novas em `git status`), reaproveite `FINDINGS.md`/`PLAN.md` e comece na Fase 8; registre a troca de modo em `STATE.md`. Se o código mudou, refaça a partir da Fase 1.

## Fase 1 — baseline

Antes de qualquer edição:
1. leia `CLAUDE.md` e `AGENTS.md` se existirem; se o projeto segue o Padrão SaaS (`docs/standards/` + `.claude/tenancy-profile.yml`), esses documentos são a norma contra a qual os achados são classificados;
2. `git status --short`;
3. descubra branch e mudanças preexistentes;
4. grave a baseline: `Baseline commit` = `git rev-parse HEAD`; se o `STATE.md` anterior registra uma auditoria concluída (`Phase: done`), copie o `Baseline commit` dela para `Previous audit commit` antes de sobrescrever (sem auditoria anterior: `none`);
5. descubra manifests e scripts (inclusive `scripts/check-padrao.mjs` e `scripts/check-portabilidade.mjs`);
6. garanta a regra local de exclusão de `.saas-audit/` (`audit-state-protocol`, seção Git) e crie/atualize `.saas-audit/STATE.md`;
7. NÃO edite código de produto.

Se `CLAUDE.md`/`AGENTS.md` não existirem, apenas registre; crie-os somente após entender o sistema e apenas se isso fizer sentido no projeto.

## Fase 2 — mapa

Dispare `audit-architecture-mapper`.

Passe prompt autocontido:
- objetivo;
- root do projeto;
- modo;
- mudanças preexistentes que não podem ser tocadas.

Grave o resumo em `.saas-audit/ARCHITECTURE.md`.

Se `saas-shield-br` estiver disponível:
- carregue `tenant-model`;
- resolva `.claude/tenancy-profile.yml` ou faça detecção;
- NÃO assuma `company_id`.

Checkpoint.

## Fase 3 — wave Segurança Especialista

Rode em paralelo, somente quando aplicável. Cada verificação tem **um dono e roda uma vez**: não mande o mesmo SQL para `rls-auditor`, `tenant-isolation-auditor` e `migration-validator` (era o mesmo achado de RLS pago três vezes).

| Agent | Escopo nesta wave | Não faz aqui |
|---|---|---|
| `secret-hunter` | repo inteiro: código, `.env*` versionados, bundles presentes | — |
| `rls-auditor` | **dono de policies e grants**: o conjunto de migrations (ou schema consolidado), pelo estado efetivo de cada tabela (policy recriada ou dropada depois não é achado): RLS + FORCE, policies `USING`/`WITH CHECK`, grants/revokes, views (`security_invoker`), funções `SECURITY DEFINER` | código de aplicação |
| `tenant-isolation-auditor` | **caminhos de código da aplicação**: frontend, Edge Functions, route handlers/server code, chamadas `.rpc()`/`.from()`, uso de `service_role`, tenant vindo de body/claim/payload, troca de tenant, joins | não re-revisa policies SQL nem faz inventário de RLS (pule os passos de inventário e de acesso direto ao banco do processo dele); lê SQL só para entender um caminho de código (ex.: a RPC chamada é `SECURITY DEFINER`?) |
| `migration-validator` | só migrations **novas ou alteradas desde a baseline** ou as do PR/escopo informado; foco em idempotência, reversibilidade, compatibilidade e transação | nunca o histórico inteiro; RLS/tenant dessas migrations já está com o `rls-auditor` |
| `identity-access-auditor` | memberships, papéis, convites, troca de workspace, sessão/JWT, super admin | — |
| `integration-reliability-auditor` | webhooks, filas/workers, APIs externas | — |

Migrations para o `migration-validator` (os agentes do shield não têm shell; calcule você, com o diretório de migrations do mapa, ex.: `supabase/migrations`):

```bash
git diff --name-only <Previous audit commit>..HEAD -- <dir-migrations>   # só se houver auditoria anterior
git status --short -- <dir-migrations>                                    # novas/não commitadas
git diff --name-only <base>...HEAD -- <dir-migrations>                   # só se o usuário informou PR/branch base
```

Lista vazia → `migration-validator` N/A, com o motivo "histórico já aplicado coberto pelo `rls-auditor`". Migrations que o usuário disser estarem pendentes de aplicação entram na lista.

Seleção:
- sem tenancy → pule tenant/RLS específicos e registre N/A;
- sem integrações/webhooks/fila → integration-reliability N/A.

Forneça a cada agent:
- mapa resumido;
- tenancy-profile resolvido;
- escopo da tabela acima (paths explícitos) e o que fica com outro agente;
- no Padrão SaaS, a norma de identidade: policies usam `(select private.current_user_id())` e helpers `private.*` `stable`/`security definer`; `auth.uid()` direto em policy é desvio da norma (P3 no legado, P2 em migration nova); permissões e empresa ativa são lidas do banco a cada requisição, nunca de claim do JWT;
- pedido para usar `agent-result-contract`;
- instrução para não despejar arquivos inteiros.

Consolide somente evidência necessária em `FINDINGS.md`.

## Fase 4 — wave Code Health

Se `code-health` estiver disponível, rode em paralelo:
- `functional-auditor`;
- `dead-code-scanner`;
- `supabase-auditor` somente se houver Supabase.

Objetivo desta wave é AUDITAR.
Não aceite automaticamente remoções de dead code como correção de segurança.

Consolide findings relevantes:
- funcional;
- rotas;
- mocks/stubs;
- referências Supabase quebradas;
- dead code com risco real.

### Padrão SaaS e portabilidade (você mesmo, em paralelo à wave)

Os scripts são do projeto, determinísticos e só leem. Rode-os sem flags de escrita: nunca `--write-baseline`, `--write-nested` ou `--write-manifest` no audit.

**`scripts/check-padrao.mjs` existe** → `node scripts/check-padrao.mjs`. Cada erro vira finding P3 (conformidade com a norma), com sugestão `padrao-saas:aplicar`.

**`scripts/check-portabilidade.mjs` existe** → grave a saída em `.saas-audit/` e leia só o resumo (em projeto legado a lista de violações é enorme). Exit 1 significa dívida nova, não falha do script; sem JSON válido, registre `INCONCLUSIVE` com a primeira linha de `portabilidade.err`.

```bash
node scripts/check-portabilidade.mjs --json > .saas-audit/portabilidade.json 2> .saas-audit/portabilidade.err; echo "exit=$?"
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(".saas-audit/portabilidade.json", "utf8"));
let base = null;
try { base = JSON.parse(fs.readFileSync(".claude/portabilidade-baseline.json", "utf8")); } catch (e) {}
const porArquivo = {};
for (const f of r.findings) porArquivo[f.file] = (porArquivo[f.file] || 0) + 1;
const modulo = p => (p.match(/^(src\/)?(features|modules|pages|app)\/[^/]+/) || p.match(/^supabase\/functions\/[^/]+/) || [p.split("/").slice(0, 2).join("/")])[0];
const porModulo = {};
for (const [f, n] of Object.entries(porArquivo)) porModulo[modulo(f)] = (porModulo[modulo(f)] || 0) + n;
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
const nova = base ? Object.entries(porArquivo).filter(([f, n]) => n > (base[f] || 0)).map(([f, n]) => [f, n - (base[f] || 0)]) : [];
const nNova = nova.reduce((s, [, n]) => s + n, 0);
console.log(JSON.stringify({ total: r.total, arquivos: r.files, porRegra: r.byRule,
  linhaDeBase: base ? Object.values(base).reduce((a, b) => a + b, 0) : "ausente",
  legado: r.total - nNova, arquivosComDividaNova: nova.length,
  dividaNova: nova.slice(0, 20).map(([f, n]) => ({ arquivo: f, modulo: modulo(f), novas: n,
    linhas: r.findings.filter(x => x.file === f).slice(0, 5).map(x => x.line + " " + x.rule) })),
  melhoraram: base ? Object.keys(base).filter(f => (porArquivo[f] || 0) < base[f]).length : 0,
  topModulos: top(porModulo), topArquivos: top(porArquivo) }));
'
```

Registre em `FINDINGS.md` os totais por regra e os top módulos/arquivos, e classifique:
- **dívida nova** (arquivo acima da linha de base `.claude/portabilidade-baseline.json`) → **P2**, um finding por módulo, com os arquivos e linhas;
- **dívida legada** (dentro da linha de base) → **P3**, um único finding com os top módulos e o item de plano "reduzir linha de base por módulo", começando pelos módulos que já vão ser alterados;
- **linha de base ausente** → toda a dívida conta como legada (P3), com a ação manual "gravar a linha de base via `padrao-saas:aplicar` (ou `node scripts/check-portabilidade.mjs --write-baseline`)". Sem ela o CI acusa todo arquivo como dívida nova;
- `melhoraram` > 0 → ação manual "rodar `--write-baseline` para travar o ganho".

**Script ausente, mas o projeto tem `docs/standards/`** → finding P3 "check-portabilidade ausente (padrão desatualizado no projeto)", sugerindo `padrao-saas:aplicar` para atualizar. Vale o mesmo para `check-padrao.mjs`. Sem `docs/standards/` → N/A (projeto fora do Padrão SaaS).

O audit nunca refatora para portabilidade em `--audit-only`. Em `--fix`/`--full`, só a dívida nova (P2) pode ser corrigida, movendo a chamada para o adapter do módulo com patch pequeno e testado. A dívida legada nunca é refatorada pelo audit: fica no plano.

## Fase 5 — wave Riscos Complementares

Rode em paralelo:
- `business-process-auditor`;
- `ai-automation-auditor` se houver IA/MCP/agents/tools;
- `data-resilience-auditor`.

Forneça a cada agent:
- mapa resumido;
- tenancy-profile resolvido (ou `sem multi-tenant`/`INCONCLUSIVE`);
- escopo;
- lista curta (ID + título) dos findings já registrados nas waves 3 e 4, para não reauditar o que é dos especialistas;
- para o `data-resilience-auditor`, a lista de migrations novas/alteradas calculada na Fase 3 (risco de DROP/lock/backfill vale para o que ainda vai rodar).

Esses agentes cobrem principalmente:
- pagamentos;
- concorrência;
- idempotência;
- falhas parciais;
- abuso/custo;
- IA/prompt injection;
- storage;
- backup/restore;
- exclusão/retenção;
- audit trail;
- privacidade técnica.

Checkpoint.

## Fase 6 — classificação consolidada

Deduplicate findings de agentes diferentes pela causa raiz.

Classificação:
- P0 — crítico;
- P1 — alto;
- P2 — médio;
- P3 — hardening/baixo.

Os agentes de origem usam escalas diferentes. Converta na consolidação (a escala P0–P3 aqui é a do `agent-result-contract` do saas-shield-br, então os auditores do shield entram sem conversão):

| Origem | Escala do agente | Vira |
|---|---|---|
| `saas-shield-br` (todos os auditores) | P0 / P1 / P2 / P3 | igual |
| skills do shield em modo manual (`rls-reviewer`, `edge-function-guard`, `vercel-deploy-guard`, `schema-diff`) | 🚨 bloqueante / 🟡 atenção / 🔵 info | 🚨 → P0 se vazamento cross-tenant ou secret real, senão P1 · 🟡 → P2 · 🔵 → P3 |
| `code-health:functional-auditor` | BLOCKER / HIGH / MEDIUM / LOW | BLOCKER → P1 (P0 só se expõe dado/pagamento) · HIGH → P2 (P1 se em rota pública/checkout) · MEDIUM → P3 · LOW → P3 opcional |
| `code-health:supabase-auditor` | BLOCKER / HIGH / MEDIUM / LOW | mesma regra acima |
| `code-health:dead-code-scanner` | confidence high / medium / low | P3 (não é vulnerabilidade); sobe para P2 só se o dead code esconde secret ou rota ativa |
| `business-process-auditor`, `data-resilience-auditor`, `ai-automation-auditor` | P0–P3 (contrato do shield) | igual |
| `scripts/check-portabilidade.mjs` do projeto | dívida nova / legada | nova (acima da linha de base) → P2 · legada → P3 |
| `scripts/check-padrao.mjs` do projeto | erro / aviso | erro → P3 · aviso → nota no relatório |

Quando dois agentes reportam a mesma causa raiz com severidades diferentes, prevalece a maior — e registre a divergência no finding.

Cada finding precisa:
- ID estável `AUD-###`;
- severidade;
- área;
- arquivo/linha ou evidência equivalente;
- causa raiz;
- pré-condição;
- impacto;
- correção proposta;
- risco da correção;
- teste planejado;
- status.

Status:
`CONFIRMADO | CORRIGIDO | MITIGADO | PENDENTE | FALSO_POSITIVO | INCONCLUSIVE`

Não classifique teoria sem evidência como vulnerabilidade confirmada.

Grave `FINDINGS.md`.

## Fase 7 — plano

Crie `.saas-audit/PLAN.md`.

Ordem:
1. P0;
2. regressão P0;
3. P1;
4. regressão;
5. P2;
6. P3 relevante somente em `--full`;
7. regressão final.

Agrupe correções por causa raiz para evitar patches contraditórios.

Dívida legada de portabilidade entra no plano como "reduzir linha de base por módulo" (módulo, nº de violações, ordem sugerida), fora das ondas de correção do audit.

Se `--audit-only` (o padrão), encerre aqui gerando `REPORT.md` (`Phase: done`) e diga ao usuário que nada foi corrigido: para corrigir, ele roda `/saas-audit-br:audit --fix`.

## Fase 8 — correção

Carregue `security-fix-protocol`.

Para cada lote:
1. revalide `git status`;
2. não toque mudanças preexistentes não relacionadas;
3. faça patch mínimo;
4. crie/ajuste teste;
5. rode teste alvo;
6. atualize finding;
7. checkpoint.

Não execute ação irreversível em produção. Prepare-a como ação manual.

### Correção de findings do code-health
- corrija somente bugs/risco dentro do escopo;
- não faça “faxina” massiva só porque dead-code-scanner encontrou itens;
- dead code não relacionado permanece P3/opcional.

## Fase 9 — regressão

Dispare `security-regression-verifier` com:
- baseline;
- findings corrigidos;
- arquivos alterados;
- scripts detectados;
- tenancy-profile resolvido.

Para findings corrigidos que vieram de um especialista (`saas-shield-br`/`code-health`), re-dispare o agente de origem com escopo restrito aos arquivos alterados, em vez de reauditar essa área no verifier. Migration criada pelo fix é migration nova: passe-a ao `migration-validator` (e ao `rls-auditor` se mexe em policy/grant). Se o projeto tem `scripts/check-portabilidade.mjs`, rode-o de novo (sem flags): o fix não pode criar dívida nova.

Além dos testes alvo, rode o que fizer sentido:
- unit;
- integration;
- E2E;
- lint;
- typecheck;
- build.

Não rode comandos arbitrários que não pertençam ao projeto.

Grave `.saas-audit/TESTS.md`.

Se a regressão falhar por causa do patch:
- volte ao finding;
- corrija;
- repita o teste.

Se a falha for preexistente:
- registre explicitamente.

## Fase 10 — documentação

Atualize `CLAUDE.md` e `AGENTS.md` somente se houver nova informação DURADOURA importante:
- regra crítica de segurança;
- tenancy;
- procedimento de migration;
- comando de teste;
- decisão arquitetural.

Onde gravar:
- se o `CLAUDE.md` importa `@AGENTS.md` (Padrão SaaS), edite **só** o `AGENTS.md`, e só com regra que vale para toda tarefa;
- detalhe de um assunto vai para a seção "Particularidades deste projeto" do padrão correspondente em `docs/standards/` ou para `docs/modules/<modulo>.md`;
- nunca edite o corpo normativo de `docs/standards/` (o `scripts/check-padrao.mjs` do projeto acusa);
- sem o Padrão SaaS, mantenha `CLAUDE.md` e `AGENTS.md` sincronizados quando o projeto exigir essa convenção.

Nunca grave secrets.

## Fase 11 — relatório

Gere `.saas-audit/REPORT.md` com:
1. resumo executivo;
2. escopo;
3. stack/tenancy;
4. P0/P1/P2/P3;
5. corrigidos;
6. pendentes;
7. falsos positivos;
8. inconclusivos;
9. arquivos alterados;
10. migrations;
11. testes e resultados;
12. build/lint/typecheck;
13. Padrão SaaS: resultado do `check-padrao` e portabilidade (total por regra, dívida nova × legada, top módulos, linha de base presente ou não);
14. credenciais a rotacionar, mascaradas;
15. ações manuais;
16. riscos residuais;
17. cobertura que não pôde ser validada.

Nunca conclua “o sistema é seguro”.
Conclua exatamente o que foi auditado e validado.

## Protocolo de contexto

- Use subagents para exploração volumosa.
- Não leia dezenas de arquivos no thread principal se um agent puder resumir.
- Atualize `STATE.md` após cada wave.
- Se ocorrer auto-compaction, releia estado e continue.
- Não peça novo chat apenas por tamanho; o estado existe para permitir continuidade.
- Em nova sessão, `/saas-audit-br:audit --resume` deve continuar sem refazer o projeto inteiro.
