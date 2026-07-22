---
name: agent-result-contract
description: Contrato único de entrada/saída para todos os agentes auditores do saas-shield-br. Define o formato de veredito, a matriz de severidade (P0–P3), o schema de cada achado e as regras de evidência. Pré-carregue esta skill em todo agente auditor (via `skills:` no frontmatter) para que os relatórios sejam consistentes e comparáveis entre execuções.
---

# agent-result-contract

Fonte única da verdade sobre **como um agente auditor reporta**. Nenhum agente deve reinventar o formato de saída — todos herdam este contrato. Isto existe para que `pre-deploy`, `audit-tenant` e qualquer orquestrador consigam **consolidar** relatórios de agentes diferentes sem parsing frágil.

## Entrada esperada (o agente deve descobrir ou perguntar)

- **Escopo**: projeto inteiro, diretório, ou apenas arquivos alterados (diff).
- **Tipo de revisão**: `completa` | `incremental` | `pré-release`.
- **Arquitetura de tenancy declarada**: leia `.claude/tenancy-profile.yml` (ver skill [tenant-model]). Se não existir, **detecte** e registre como detectou; se ainda assim indeterminado, reporte `INCONCLUSIVE` para os itens dependentes — nunca assuma `company_id`.

## Regras de evidência (inegociáveis)

1. **Sem evidência não há controle aprovado.** Só liste um controle como aprovado se você viu a linha que o implementa.
2. **Controle ausente ≠ silêncio.** Quando um controle obrigatório não for encontrado, informe **quais caminhos, padrões e arquivos** você pesquisou. Isso separa "auditei e não existe" de "não auditei".
3. **Todo achado é acionável**: arquivo + linha, controle esperado, evidência (presente ou ausente), cenário concreto de falha, impacto, correção, teste de confirmação, confiança.
4. **`service_role`/admin client não é seguro só por estar no backend.** Prove o filtro de tenant.
5. **Confiança honesta**: `alta` (vi o vetor completo), `média` (indício forte, falta 1 elo), `baixa` (suspeita, precisa validação humana).

## Matriz de severidade

| Nível | Significado | Bloqueia release? |
|---|---|---|
| **P0** | Vazamento cross-tenant, acesso admin irrestrito, secret real exposto | **Sim** |
| **P1** | Bypass de autorização, escrita no tenant errado, RLS ausente em tabela sensível | **Sim** |
| **P2** | Defesa em profundidade ausente, explorável com pré-condições | Não (mas registrar) |
| **P3** | Manutenção, consistência, performance, custo | Não |

## Contrato de saída (formato fixo)

```
## Resultado
- Veredito: PASS | PASS_WITH_WARNINGS | FAIL | INCONCLUSIVE
- Escopo analisado: <o que foi coberto>
- Cobertura: <o que foi efetivamente inspecionado>
- Confiança geral: <alta | média | baixa>
- Bloqueantes: <N (P0/P1)>
- Atenções: <N (P2/P3)>

## Achados

### FINDING-001 — <título curto>
- Severidade: P0|P1|P2|P3
- Bloqueante: sim|não
- Categoria: <rls | tenant-isolation | secret | migration | identity | integration | perf | ...>
- Local: <arquivo:linha>
- Controle esperado: <o que deveria existir>
- Evidência: <o que foi encontrado / o que está ausente>
- Cenário: <inputs concretos → resultado indevido>
- Impacto: <consequência>
- Correção: <patch mínimo ou passos>
- Validação: <teste/comando que confirma a correção>
- Confiança: alta|média|baixa

## Controles aprovados
<liste apenas os confirmados com evidência>

## Lacunas de cobertura
<tudo que NÃO pôde ser verificado, e por quê>

## Próxima ação
<a menor ação necessária para remover os bloqueantes>
```

## Mapeamento de veredito

- **FAIL** — existe ≥1 bloqueante (P0/P1). Encerre com: *"Recomendação: não aplique/deploy. Corrija os bloqueantes."*
- **PASS_WITH_WARNINGS** — nenhum bloqueante, mas há P2/P3.
- **PASS** — nenhum achado; controles obrigatórios confirmados com evidência.
- **INCONCLUSIVE** — não foi possível determinar o essencial (ex.: sem `tenancy-profile` e sem detecção confiável). Diga exatamente o que falta para concluir.

## Anti-desonestidade

Nunca afirme ter executado o que suas ferramentas não permitem. Se você só tem `Read/Grep/Glob`, você faz **análise estática** — diga isso. Comandos que exigem execução (`git log`, `gitleaks`, `supabase db reset`, build de bundle, `npm test`) devem ser **emitidos como próxima ação** para o humano/CI, não reportados como se tivessem rodado.
