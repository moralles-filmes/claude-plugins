---
description: Roda varredura completa de dead code (arquivos órfãos, imports/exports não usados, deps não usadas, assets esquecidos) e gera relatório com plano de limpeza segura. Aplicação só após aprovação explícita.
argument-hint: [scope: full|imports|deps|assets|files]
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Task
---

# Cleanup — varredura de dead code

Você foi invocado pelo comando `/code-health:cleanup`. Argumento opcional: $ARGUMENTS (default: `full`).

## Plano de execução

1. Carregue o skill `dead-code-cleanup` (já estará disponível como contexto). Siga o workflow das 5 fases.
2. Ajuste o escopo conforme o argumento:
   - `full` (default): rode todos os 7 detectores
   - `imports`: só detector ESLint (imports/vars não usados)
   - `deps`: só knip + depcheck (dependências)
   - `assets`: só ripgrep em `public/`
   - `files`: só knip + cross-reference de componentes
3. Delegue a varredura pesada para o subagent `dead-code-scanner` via Task tool.
4. **Pare na Fase 4** (apresentação do relatório). Não aplique nada automaticamente.
5. Mostre ao usuário:
   - Caminho do relatório (`./code-health-reports/dead-code-<timestamp>.md`)
   - Resumo executivo (4-5 linhas)
   - Pergunta clara: "Quer aplicar o Lote 1 (alta confiança, X itens)?"

## Garantias de segurança

- Antes de qualquer scan, valide que `git status` está limpo
- NÃO aplique remoções neste comando — apenas reporte
- Para aplicar, o usuário deve aprovar explicitamente cada lote depois

## Output esperado

Ao final, sua resposta deve ter exatamente esta forma:

```
✅ Varredura completa.

📄 Relatório: ./code-health-reports/dead-code-<timestamp>.md

Resumo:
- 🟢 Alta confiança: X itens (auto-aplicáveis)
- 🟡 Média confiança: Y itens (revisar item-a-item)
- 🔴 Baixa confiança: Z itens (manual)
- Economia estimada: ~N arquivos / ~M KB

Próximos passos:
[1] Aplicar Lote 1 (alta confiança) — ~5 min
[2] Revisar relatório completo primeiro
[3] Cancelar

Qual escolha?
```
