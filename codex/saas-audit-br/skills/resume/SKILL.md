---
name: resume
description: "Retoma a auditoria saas-audit-br a partir do estado persistido sem repetir fases concluídas. Use só quando o usuário pedir explicitamente."
---

Leia `.saas-audit/STATE.md`.

Se o último escopo (`Last scope`/`Scope`) for um módulo, leia também o `STATE.md` correspondente em `.saas-audit/modules/`.

Depois:
1. resuma fase atual, bloqueantes e último checkpoint;
2. releia apenas os arquivos de estado necessários;
3. recarregue o procedimento pelo arquivo (`audit` é manual e não pode ser carregada pelo modelo; `module` também é lida pelo arquivo para seguir a fase registrada):
   - carregue `audit-state-protocol`; se a fase for `fix-*`, `hardening` ou `regression`, carregue também `security-fix-protocol`; se o escopo for módulo, carregue `module-scope`;
   - leia o procedimento em `<plugin-root>/skills/audit/SKILL.md` (escopo completo) ou `<plugin-root>/skills/module/SKILL.md` (escopo módulo) e siga a partir da fase registrada;
   - respeite o `Mode` gravado no estado (`audit-only` não edita código). Se o `Mode` for `fix`/`full` sem `(explicit)` — estado criado antes da 1.3.0, quando `--fix` era o padrão —, pergunte ao usuário antes de editar código; sem confirmação, continue como `audit-only`;
4. continue exatamente da seção `Next`;
5. não repita waves já concluídas sem evidência de que ficaram inválidas.

Se não houver estado, informe que não existe auditoria para retomar e não invente progresso.

## Nota para o Codex

Gerado de `saas-audit-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-audit-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
