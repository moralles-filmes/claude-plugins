---
name: mudanca
description: 'Conduz uma mudança num SaaS que segue o Padrão SaaS em fases curtas — plano em .tasks/<slug>/PLAN.md aprovado pelo usuário, cada fase executada com contexto limpo (subagente, ai-router-br ou sessão nova), verificação e STATE.md atualizados ao fim de cada fase, e retomada pelo estado em disco em vez do histórico do chat. Use quando o usuário pedir alteração, feature, ajuste de regra ou correção que toca mais de uma camada (banco, servidor, tela, integração) ou mais de 5 arquivos, quando pedir para "fazer em fases", "dividir em etapas", "não estourar o contexto", ou para retomar ou continuar uma mudança em andamento. Não use para ajuste local pequeno (faça direto), módulo ou submódulo novo (padrao-saas:novo-modulo), auditoria (saas-audit-br) nem lentidão (turbo).'
---

# Mudança em fases — Padrão SaaS v3.2

Cada fase começa com contexto limpo e termina com uma entrega verificada e registrada em disco. A conversa principal planeja, aprova, verifica e integra; a execução pesada fica fora dela. Chat longo dilui a atenção do modelo e a compactação perde detalhe; o `STATE.md` é o que permite trocar de contexto sem perder nada.

Argumento: o pedido, ou o `<slug>` de uma mudança em andamento. Se existir `.tasks/<slug>/STATE.md`, comece pela Etapa 0.

Leia o `AGENTS.md` (§8, §9 e §10) e só os padrões que o roteador do §8 pede para esta mudança. Se o projeto não tem `docs/standards/`, pare e sugira `padrao-saas:aplicar`.

## Quando não dividir

- **Mudança local** (uma camada, até 5 arquivos, sem migration): faça direto, sem plano. Dividir tem custo: cada executor relê o AGENTS.md, os padrões e os arquivos.
- Módulo ou submódulo novo → `padrao-saas:novo-modulo`. Auditoria → `saas-audit-br`. Lentidão → `turbo`.

## Etapa 0 — Retomada

1. Leia `.tasks/<slug>/STATE.md` e `PLAN.md`.
2. Confira contra `git status` e `git diff` (AGENTS.md §10). Arquivo alterado que o STATE não registra, ou fase marcada como concluída sem o diff correspondente: relate e pergunte antes de seguir.
3. Retome pelo "Próximo passo" do STATE. Não reconstrua a mudança pela memória da conversa.

## Etapa 1 — Investigação e plano (pare para aprovação)

1. Investigue o fluxo atual, contratos, tabelas, policies, permissões, integrações e testes envolvidos. Se a busca varre muitos arquivos, use um subagente de leitura e traga só as conclusões, com arquivo:linha.
2. Escreva `.tasks/<slug>/PLAN.md`:

   ```markdown
   # <objetivo em uma frase>
   Pedido: <o que o usuário pediu; regra de negócio nas palavras dele>
   Fora do escopo: ...
   Regras de negócio a confirmar: ...

   ## Fase 1 — <entrega verificável>
   - Camada: banco | servidor | tela | integração | testes | docs
   - Risco: crítico | comum
   - Arquivos: <caminhos>
   - Padrões: <docs/standards/... que a fase exige>
   - Pronto quando: <comando que prova, ou verificação objetiva>
   ```

   Risco **crítico**: acesso, tenant, RLS, grants, auth, segredo, dinheiro, migration ou produção.
3. Regras do corte:
   - uma fase = uma entrega que deixa o sistema consistente e verificável (migration + pgTAP passando; caso de uso + teste; tela com os quatro estados). Não corte por arquivo;
   - ordem por dependência: banco → servidor → tela → integrações → docs. Mudança de estrutura existente segue expand → backfill → contract (DATABASE);
   - de 2 a 6 fases. Mais que isso, proponha dividir o pedido em mudanças separadas;
   - fases que não tocam os mesmos arquivos podem rodar em paralelo.
4. Crie o `STATE.md` (formato no fim desta skill).
5. **Pare.** Mostre o plano em até 15 linhas (fases, risco de cada uma, o que fica fora) e as regras a confirmar. Não invente regra de negócio. Se o plano mudar depois em escopo ou risco, atualize o PLAN.md e peça nova aprovação.

## Etapa 2 — Executar uma fase

1. **Escolha o executor**, nesta ordem:

   | Disponível | Executor da fase |
   |---|---|
   | `ai-router-br` | skill `ai-router-br:route`, com os arquivos da fase no TASK PACKAGE. O veredito dele vale: risco crítico fica com você, o resto vai para o degrau mais barato que dá conta. |
   | `saas-builder-br` | o especialista da camada: `db-schema-designer` (banco), `backend-supabase` (servidor), `frontend-react` e `design-ux` (tela), `integrador-apis` (integração), `qa-testes` (testes). |
   | nenhum dos dois | subagente de uso geral; fase crítica fica com você. |
   | sem subagentes | você executa e usa a fronteira de sessão da Etapa 3. |

2. **Prompt de delegação**, autocontido (o executor não vê esta conversa):

   ```text
   Mudança: <objetivo> — Fase N de M: <entrega>
   Leia: AGENTS.md, .tasks/<slug>/PLAN.md (só a Fase N), <padrões da fase>, <arquivos>
   Faça: <o que mudar, com critérios de aceite>
   Não faça: alterar arquivo fora da fase; migration remota, deploy ou push; afrouxar RLS, policy ou grant
   Devolva em até 15 linhas: arquivos alterados; comandos executados com resultado
   (ou NÃO EXECUTADO — motivo); dúvidas e pendências
   ```

   Referencie caminhos. Não cole spec, padrão ou arquivo inteiro no prompt.
3. **Confira o resultado.** Veja `git diff --stat` e o diff dos arquivos da fase. Arquivo fora da fase não é aceito em silêncio: devolva ao executor ou relate ao usuário.
4. **Verifique você mesmo** o "Pronto quando", com os comandos oficiais (os especialistas de banco, servidor e tela do saas-builder-br não têm shell). Em fase crítica, com o saas-shield-br instalado, passe pelo gate da camada:
   - banco → `migration-validator` ou `rls-auditor`;
   - servidor → `tenant-isolation-auditor`;
   - integração → `secret-hunter` e `integration-reliability-auditor`;
   - permissões e papéis → `identity-access-auditor`.

   Bloqueante devolve a fase ao executor; ela não fecha.
5. **Feche a fase.** Atualize o STATE.md (fase concluída, executor, validação que rodou, pendências, próximo passo). Se o usuário quiser um commit por fase, faça commit local na branch de trabalho; push só com autorização (AGENTS.md §6).
6. **Relate em até 5 linhas:** fase N/M concluída, o que foi validado e a próxima fase. Não cole o relatório do executor.

## Etapa 3 — Entre fases

- Com o estado em disco, a conversa principal pode recomeçar a qualquer momento. Se ela já está longa (fase executada aqui, investigação pesada, várias correções), sugira `/clear` ou uma sessão nova e retomar com `/padrao-saas:mudanca <slug>`. A Etapa 0 reconstrói tudo pelo STATE.md.
- Quando a conversa principal só orquestrou executores, ela cresce pouco: não interrompa a cada fase.
- Pare para o usuário quando aparecer regra de negócio nova, quando o plano mudar em escopo ou risco, ou quando o próximo passo tocar produção (migration remota, deploy).

## Etapa 4 — Fechamento

1. Rode os comandos oficiais completos (lint, typecheck, testes, `supabase test db`, build), `node scripts/check-padrao.mjs` e `node scripts/check-portabilidade.mjs`. Se a mudança tocou `package.json` ou lockfile, rode também `node scripts/security/deps-audit.mjs` (0 P0/P1; um lockfile só) e, antes do push, `node scripts/security/secret-scan.mjs --outgoing`. Dependência nova ou subida de major entra no PLAN.md como decisão do usuário, nunca dentro de uma fase sem aprovação.
2. Regra durável criada pela mudança vai para o doc do módulo, "Particularidades" do padrão ou ADR (AGENTS.md §10).
3. Encerre no formato do AGENTS.md §11. Tarefa sensível leva as sete seções.
4. Marque o STATE.md como concluído. `.tasks/` não vai para o Git.

## Formato do STATE.md

```markdown
# <slug> — <objetivo>
Status: planejando | aguardando aprovação | fase N/M | concluído
Branch: <branch>   Atualizado: <ISO-8601>

## Fases
- [x] 1 <entrega> — <executor> — validado: <comando → resultado>
- [ ] 2 <entrega>

## Decisões
## Arquivos alterados e não commitados
## Pendências e riscos
## Próximo passo
<uma ação concreta>
```

Mantenha curto: sem logs, diffs ou saídas de comando inteiras, e nunca segredos.
