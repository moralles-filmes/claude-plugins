---
name: audit
description: Auditoria completa de um SaaS da descoberta à correção e regressão, orquestrando saas-shield-br, code-health e auditores complementares. Use manualmente para revisar o sistema inteiro.
argument-hint: "[--audit-only | --fix | --full | --resume | --status]"
disable-model-invocation: true
---

# SaaS Audit — sistema completo

Argumentos: `$ARGUMENTS`

Modo:
- `--audit-only`: audita/classifica/planeja e NÃO edita código.
- `--fix`: padrão se nenhum modo for informado. Audita e corrige P0/P1/P2 seguros, com testes.
- `--full`: igual a `--fix`, com varredura aprofundada, hardening P3 relevante e regressão ampliada.
- `--resume`: retoma `.saas-audit/STATE.md`.
- `--status`: apenas lê estado e resume; não executa auditoria.

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

## Fase 1 — baseline

Antes de qualquer edição:
1. leia `CLAUDE.md` e `AGENTS.md` se existirem;
2. `git status --short`;
3. descubra branch e mudanças preexistentes;
4. descubra manifests e scripts;
5. crie/atualize `.saas-audit/STATE.md`;
6. NÃO edite código de produto.

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

Rode em paralelo, somente quando aplicável:

- `secret-hunter`
- `tenant-isolation-auditor`
- `identity-access-auditor`
- `integration-reliability-auditor`
- `rls-auditor`
- `migration-validator`

Seleção:
- sem tenancy → pule tenant/RLS específicos e registre N/A;
- sem migrations pendentes → migration-validator pode ser N/A;
- sem integrações/webhooks/fila → integration-reliability N/A.

Forneça a cada agent:
- mapa resumido;
- tenancy-profile resolvido;
- escopo;
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

## Fase 5 — wave Riscos Complementares

Rode em paralelo:
- `business-process-auditor`;
- `ai-automation-auditor` se houver IA/MCP/agents/tools;
- `data-resilience-auditor`.

Forneça a cada agent:
- mapa resumido;
- tenancy-profile resolvido (ou `sem multi-tenant`/`INCONCLUSIVE`);
- escopo;
- lista curta (ID + título) dos findings já registrados nas waves 3 e 4, para não reauditar o que é dos especialistas.

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

Se `--audit-only`, encerre aqui gerando `REPORT.md`.

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

Para findings corrigidos que vieram de um especialista (`saas-shield-br`/`code-health`), re-dispare o agente de origem com escopo restrito aos arquivos alterados, em vez de reauditar essa área no verifier.

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

Mantenha os dois sincronizados quando o projeto exigir essa convenção.
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
13. credenciais a rotacionar, mascaradas;
14. ações manuais;
15. riscos residuais;
16. cobertura que não pôde ser validada.

Nunca conclua “o sistema é seguro”.
Conclua exatamente o que foi auditado e validado.

## Protocolo de contexto

- Use subagents para exploração volumosa.
- Não leia dezenas de arquivos no thread principal se um agent puder resumir.
- Atualize `STATE.md` após cada wave.
- Se ocorrer auto-compaction, releia estado e continue.
- Não peça novo chat apenas por tamanho; o estado existe para permitir continuidade.
- Em nova sessão, `/saas-audit-br:audit --resume` deve continuar sem refazer o projeto inteiro.
