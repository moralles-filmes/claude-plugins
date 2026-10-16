---
name: secret-scan
description: "Scan completo de secrets vazados (código + bundle) — delega ao subagent secret-hunter. Use quando o usuário pedir (equivale ao comando /secret-scan do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill — formato `[opcional: 'with-history' para incluir instruções de scan no histórico git]`.

Rode scan completo de secrets.

## Como proceder

1. **Dispare o agente `secret-hunter`** (Agent tool com `subagent_type: secret-hunter`):
   - O agente faz a varredura estática num contexto isolado
   - Devolve relatório no contrato padrão (`agent-result-contract`) sem inflar o contexto principal

2. **Após relatório**, **se** o usuário passou `with-history` em `<argumentos>`:
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

`<argumentos>`

## Nota para o Codex

Gerado de `saas-shield-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-shield-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
