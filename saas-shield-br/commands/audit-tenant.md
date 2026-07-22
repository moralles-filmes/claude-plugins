---
description: Auditoria completa de isolamento multi-tenant no projeto inteiro — resolve o tenancy-profile e dispara o agente tenant-isolation-auditor
argument-hint: "[opcional: path específico]"
---

Rode auditoria multi-tenant completa do projeto.

## Como proceder

1. **Determine o escopo**:
   - Se `$ARGUMENTS` foi passado, audite apenas esse path.
   - Senão, audite o projeto inteiro.

2. **Resolva a convenção de tenancy** — carregue a skill `tenant-model` e leia `.claude/tenancy-profile.yml` (ou detecte). Fixe a coluna de tenant (`TC`), o resolver (`R`) e o `write_path`. **Não assuma `company_id`.**

3. **Dispare o agente `tenant-isolation-auditor`** (Agent tool com `subagent_type: tenant-isolation-auditor`), passando o escopo e o profile resolvido. Ele varre:
   - Tabelas órfãs (sem `TC`) vs globais legítimas
   - Acesso direto ao banco (RLS+FORCE, policies via `R`, views com `security_invoker`)
   - Fronteira privilegiada (Edge Function / Route Handler / RPC) com `service_role` aceitando `TC` do body
   - Troca/seleção de tenant, JOINs perigosos, payload com `TC` do cliente
   - Devolve o relatório no contrato padrão (`agent-result-contract`), com cenário de exploração por achado.

4. **Consolide** o relatório num veredito único:
   ```
   🛡️ AUDITORIA MULTI-TENANT — <projeto>  | Arquétipo: <A|B|C|D>

   📊 Resumo
     - Tabelas: X com <TC> ✅ | Y suspeitas ❌
     - Vetores de vazamento: <N>
     - Cobertura: <o que foi inspecionado> | Lacunas: <o que não pôde ser verificado>

   🚨 Bloqueantes (P0/P1): <lista com local + cenário + fix>
   🟡 Atenções (P2/P3): <lista>

   🎯 Veredito: PASS | PASS_WITH_WARNINGS | FAIL | INCONCLUSIVE
   ```

5. **Sempre encerre com a próxima ação** (a menor ação para remover os bloqueantes).

## Entrada do usuário

`$ARGUMENTS` (opcional — path do diretório a auditar)
