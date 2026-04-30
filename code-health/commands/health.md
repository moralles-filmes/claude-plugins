---
description: Roda dead-code-cleanup E functional-audit em paralelo, gera relatório consolidado de saúde do código (lixo + não-funcional) com plano priorizado.
argument-hint: (sem argumentos)
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Task
---

# Health — checkup completo do projeto

Roda os dois auditores em paralelo e consolida em um relatório único.

## Plano

1. Pré-flight: validar `git status` limpo, detectar package manager e framework.

2. Em PARALELO (uma única mensagem com dois Task calls):
   - Task → subagent `dead-code-scanner` (gera `/tmp/dead-code-findings.json`)
   - Task → subagent `functional-auditor` (gera `/tmp/functional-findings.json`)

3. Consolide ambos em `./code-health-reports/health-<timestamp>.md` com estrutura:

```markdown
# Health Report — <data>

## Diagnóstico

### Saúde funcional
Veredito: ❌ NOT-PRODUCTION-READY | ⚠️ NEEDS-WORK | ✅ PRODUCTION-READY
- 🔴 BLOCKERs: N
- 🟠 HIGH: M

### Saúde estrutural
- 🟢 Alta confiança removível: A itens
- 🟡 Média: B
- 🔴 Baixa: C

## Plano priorizado (na ordem)

### Sprint 0 — Não-deploy (BLOCKERs funcionais)
1. ...
2. ...

### Sprint 1 — Limpeza segura (alta confiança dead code)
- Aplicar Lote 1 do dead-code-cleanup (~Y min, sem risco)

### Sprint 2 — Dados reais (HIGHs funcionais)
- Substituir N mocks por fontes reais

### Sprint 3 — Polimento
- TODOs antigos, código comentado, médias confiâncias

## Caminhos para drill-down
- Funcional completo: ./code-health-reports/functional-audit-<ts>.md
- Dead code completo: ./code-health-reports/dead-code-<ts>.md
- Findings JSON brutos: /tmp/*.json
```

4. Mostre o veredito + 1 sugestão clara de próximo passo:

> "Saúde do projeto: ❌ NOT-PRODUCTION-READY. Recomendo começar pelo Sprint 0 (resolver os N BLOCKERs). Quer que eu comece?"

## Garantias

- Nada é editado neste comando
- Os 2 subagents rodam read-only e escrevem só em `/tmp/`
- O relatório consolidado fica em `code-health-reports/`
