---
name: resume
description: Retoma a auditoria saas-audit-br a partir do estado persistido sem repetir fases concluídas.
disable-model-invocation: true
---

Leia `.saas-audit/STATE.md`.

Se o último escopo (`Last scope`/`Scope`) for um módulo, leia também o `STATE.md` correspondente em `.saas-audit/modules/`.

Depois:
1. resuma fase atual, bloqueantes e último checkpoint;
2. releia apenas os arquivos de estado necessários;
3. recarregue o procedimento pelo arquivo (`audit` é manual e não pode ser carregada pelo modelo; `module` também é lida pelo arquivo para seguir a fase registrada):
   - carregue `audit-state-protocol`; se a fase for `fix-*`, `hardening` ou `regression`, carregue também `security-fix-protocol`; se o escopo for módulo, carregue `module-scope`;
   - leia o procedimento em `${CLAUDE_PLUGIN_ROOT}/skills/audit/SKILL.md` (escopo completo) ou `${CLAUDE_PLUGIN_ROOT}/skills/module/SKILL.md` (escopo módulo) e siga a partir da fase registrada;
   - respeite o `Mode` gravado no estado (`audit-only` não edita código);
4. continue exatamente da seção `Next`;
5. não repita waves já concluídas sem evidência de que ficaram inválidas.

Se não houver estado, informe que não existe auditoria para retomar e não invente progresso.
