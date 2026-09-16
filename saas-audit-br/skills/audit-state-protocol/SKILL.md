---
name: audit-state-protocol
description: Protocolo interno de persistência e retomada para auditorias longas do saas-audit-br. Mantém estado pequeno em disco para sobreviver a auto-compaction, troca de sessão e execução por fases.
user-invocable: false
---

# Estado canônico da auditoria

Use `.saas-audit/` no projeto auditado.

Arquivos:
- `STATE.md` — estado mínimo da execução.
- `ARCHITECTURE.md` — mapa resumido do sistema.
- `FINDINGS.md` — findings consolidados P0–P3.
- `PLAN.md` — plano de correção e ordem.
- `TESTS.md` — testes executados e resultados.
- `REPORT.md` — relatório final.
- `modules/<slug>/STATE.md` — estado de auditoria focada, quando aplicável.

## Regra de tamanho

`STATE.md` deve permanecer curto. Não copie logs, arquivos inteiros, outputs enormes ou secrets.

Shape recomendado:

```markdown
# SaaS Audit State
Mode: audit-only | fix | full
Scope: full | module:<nome>
Last scope: full | module:<slug> → .saas-audit/modules/<slug>/STATE.md
Phase: baseline | discovery | audit | classify | plan | fix-p0 | fix-p1 | fix-p2 | hardening | regression | done
Started: <ISO>
Updated: <ISO>

## Stack detectada
- ...

## Plugins disponíveis
- saas-shield-br: yes/no
- code-health: yes/no

## Tenant profile
- resolved: yes/no
- summary: ...

## Completed
- ...

## Current blockers
- ...

## Next
1. ...
2. ...

## Agent summaries
- <agent>: PASS/FAIL/INCONCLUSIVE — 1 linha

## Files changed by audit
- ...
```

## Checkpoints obrigatórios

Atualize o estado:
1. após baseline;
2. após mapa arquitetural;
3. após cada wave de subagents;
4. antes de qualquer correção;
5. após cada lote P0/P1/P2;
6. antes de regressão;
7. ao finalizar.

## Contexto

- Varredura pesada deve ficar em subagents.
- O thread principal recebe somente resumo/evidência necessária.
- Não cole conteúdo integral de relatórios de agents no chat principal.
- Quando o contexto for compactado, releia `STATE.md`, `FINDINGS.md` e `PLAN.md` antes de continuar.
- Se uma nova sessão começar, use o estado em disco como fonte da verdade; não tente reconstruir tudo da memória.
- Nunca grave secrets em `.saas-audit/`.

## Git

Por padrão, `.saas-audit/` é estado operacional local. Não faça commit desses arquivos sem pedido explícito do usuário.
Não altere `.gitignore` automaticamente apenas para esconder o diretório; registre a sugestão no relatório se necessário.
