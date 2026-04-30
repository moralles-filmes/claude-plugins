---
description: Scan completo de secrets vazados (código + bundle) — delega ao subagent secret-hunter
argument-hint: "[opcional: 'with-history' para incluir instruções de scan no histórico git]"
---

Rode scan completo de secrets.

## Como proceder

1. **Invoque o subagent `secret-hunter`** (Task tool):
   - Subagent faz a varredura num contexto isolado
   - Devolve relatório consolidado sem inflar contexto principal

2. **Após relatório**, **se** o usuário passou `with-history` em `$ARGUMENTS`:
   - Não rode `git log` automaticamente (a skill não tem permissão e é arriscado)
   - Forneça os comandos para o usuário rodar manualmente:
     ```bash
     # Procura secrets em todo histórico git
     git log -p --all -S "service_role" | head -100
     git log -p --all -S "sk_live_" | head -100
     git log -p --all -S "AKIA" | head -100
     git log -p --all -S "eyJhbGc" | head -100
     ```
   - Recomende ferramentas: `gitleaks detect`, `trufflehog git file://./`

3. **Resuma** o relatório do subagent em uma linha de status:
   ```
   🔐 Status: <CLEAN | <N> secrets a rotacionar>
   
   <relatório completo do subagent>
   
   ⚡ Ação imediata: <topo da lista de rotação>
   ```

4. **Se houver críticos**, ofereça gerar:
   - Migration de update no Vercel/Supabase env vars
   - PR com remoção dos secrets do código
   - Atualização do `.gitignore`

## Entrada do usuário

`$ARGUMENTS`
