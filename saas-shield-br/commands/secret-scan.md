---
description: Scan completo de secrets vazados — executa a varredura do histórico git (todas as refs) e delega a varredura estática (código, .env, bundle) ao subagent secret-hunter
argument-hint: "[opcional: 'no-history' para pular o histórico (resultado fica INCONCLUSIVO para o histórico)]"
---

Rode scan completo de secrets. O histórico é **executado** aqui, na sessão principal: o agente `secret-hunter` é só leitura e não roda git.

## Como proceder

1. **Histórico (executar)**, a menos que o usuário tenha passado `no-history` em `$ARGUMENTS`:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/security/secret-scan.mjs --history --repo .
   ```
   - `exit 0`: nada no histórico.
   - `exit 1`: achado. Mostre a lista (commit, arquivo, tipo; o script nunca imprime o valor) e siga `skills/secret-scanner/rotation-runbook.md` na ordem: provedor primeiro.
   - `exit 2`: INCONCLUSIVO. Clone raso → peça `git fetch --unshallow` e rode de novo; não é repo git → registre.
   - Se `gitleaks` ou `trufflehog` estiverem instalados, rode também `gitleaks git . --log-opts="--all" --redact` e `trufflehog git file://. --results=verified,unknown` e junte os achados (sem colar valores).

2. **Estático: dispare o agente `secret-hunter`** (Agent tool com `subagent_type: secret-hunter`):
   - Varre working tree, `.env*` versionados (com o critério de `.env` público) e bundles presentes num contexto isolado.
   - Devolve relatório no contrato padrão (`agent-result-contract`) sem inflar o contexto principal.

3. **Staged** (se houver mudança no índice): `node ${CLAUDE_PLUGIN_ROOT}/scripts/security/secret-scan.mjs --staged --repo .`

4. **Resuma** em uma linha de status e depois os relatórios:
   ```
   🔐 Status: <CLEAN | <N> secrets a rotacionar | INCONCLUSIVO (<motivo>)>
   Histórico: <N commits, todas as refs> — <achados | nada | INCONCLUSIVO>

   <achados do histórico>
   <relatório completo do subagent>

   ⚡ Ação imediata: <topo da lista de rotação: provedor + chave + passo 1 do runbook>
   ```
   `CLEAN` só quando histórico **e** estático passaram. Histórico pulado ou inconclusivo nunca é `CLEAN`.

5. **Se houver críticos**, conduza o runbook com o usuário (rotação real é ele quem executa ou autoriza) e ofereça:
   - atualização das env vars na Vercel/Supabase depois da chave nova;
   - PR com a remoção do secret do código e o `.gitignore`;
   - registro do incidente; reescrita do histórico só se o usuário decidir, por último.

## Entrada do usuário

`$ARGUMENTS`
