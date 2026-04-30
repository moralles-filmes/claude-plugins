---
description: Auditoria completa de isolamento multi-tenant no projeto inteiro — invoca multi-tenant-auditor + tenant-leak-hunter
argument-hint: "[opcional: path específico]"
---

Rode auditoria multi-tenant completa do projeto.

## Como proceder

1. **Determine o escopo**:
   - Se `$ARGUMENTS` foi passado, audite apenas esse path
   - Senão, audite o projeto inteiro

2. **Invoque a skill `multi-tenant-auditor`** primeiro:
   - Inventário de tabelas (com/sem company_id)
   - Validação das 4 camadas para cada tabela
   - Relatório estruturado

3. **Se houver bloqueantes ou suspeitas de vazamento, invoque o subagent `tenant-leak-hunter`** (Task tool com subagent_type tenant-leak-hunter):
   - Caça vetores de bypass (service_role, edge functions, views, JOINs)
   - Devolve plano de remediação por vetor

4. **Consolide ambos relatórios** num veredito único:
   ```
   🛡️ AUDITORIA MULTI-TENANT — <projeto>
   
   📊 Resumo
     - Tabelas: X com company_id ✅ | Y suspeitas ❌
     - Defesa em 4 camadas: <X>/<total> ✅
     - Vetores de vazamento identificados: <N>
   
   🚨 Bloqueantes
     <lista consolidada>
   
   🟡 Atenções
     <lista consolidada>
   
   🎯 Veredito: <APROVADO | BLOQUEADO POR <N> ITENS>
   ```

5. **Sempre encerre com próximos passos numerados**.

## Entrada do usuário

`$ARGUMENTS` (opcional — path do diretório a auditar)
