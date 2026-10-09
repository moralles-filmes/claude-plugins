---
description: Roda dead-code-cleanup E functional-audit em paralelo, gera relatório consolidado de saúde do código (lixo + não-funcional) com plano priorizado.
argument-hint: (sem argumentos)
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# Health — checkup completo do projeto

Roda os dois auditores em paralelo e consolida em um relatório único.

## Plano

1. Pré-flight: validar `git status` limpo, detectar package manager e framework.

2. Em PARALELO (uma única mensagem com duas chamadas da Agent tool):
   - Agent → subagent `dead-code-scanner` (gera `.code-health/dead-code-findings.json`)
   - Agent → subagent `functional-auditor` (gera `.code-health/functional-findings.json`)

   Leia os caminhos que cada subagent devolver. `.code-health/` fica fora do git (`.git/info/exclude`, Passo 0 dos agentes).

3. **Portabilidade (Padrão SaaS).** Se o projeto tem `scripts/check-portabilidade.mjs`, rode-o e inclua o resumo no relatório. O code-health não duplica essa lógica: o script é a fonte, e classificação P2/P3 e plano por módulo ficam com o `saas-audit-br`. Nunca use `--write-baseline` aqui.

```bash
mkdir -p .code-health/work/health
node scripts/check-portabilidade.mjs --json > .code-health/work/health/portabilidade.json; echo "exit=$?"
node -e 'const r = JSON.parse(require("fs").readFileSync(".code-health/work/health/portabilidade.json", "utf8")); const c = {}; for (const f of r.findings) c[f.file] = (c[f.file] || 0) + 1; console.log(JSON.stringify({ total: r.total, porRegra: r.byRule, arquivosAcimaDaLinhaDeBase: r.regressions.length, top: Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5) }))'
```

   Exit 1 = há arquivo acima da linha de base. Sem `.claude/portabilidade-baseline.json`, todo arquivo aparece acima dela: diga "linha de base não gravada" em vez de chamar a dívida de nova. Script ausente → omita a seção (ou, se o projeto tem `docs/standards/`, anote que o `check-portabilidade` falta e que `padrao-saas:aplicar` o instala).

4. Consolide tudo em `./code-health-reports/health-<timestamp>.md` com estrutura:

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

### Portabilidade (só com scripts/check-portabilidade.mjs)
- Total: N violações (por regra: ...)
- Arquivos acima da linha de base: K (ou "linha de base não gravada")
- Top arquivos: ...

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
- Findings JSON brutos: .code-health/*.json
```

5. Mostre o veredito + 1 sugestão clara de próximo passo:

> "Saúde do projeto: ❌ NOT-PRODUCTION-READY. Recomendo começar pelo Sprint 0 (resolver os N BLOCKERs). Quer que eu comece?"

## Garantias

- Nada é editado neste comando
- Os 2 subagents rodam read-only e escrevem só em `.code-health/` (fora do git)
- O relatório consolidado fica em `code-health-reports/`
