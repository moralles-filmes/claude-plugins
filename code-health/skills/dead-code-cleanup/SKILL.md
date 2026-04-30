---
name: dead-code-cleanup
description: Varredura completa de dead code e lixo no projeto JS/TS/React/Next.js. Use quando o usuário pedir para "limpar código morto", "remover arquivos não usados", "varrer o sistema procurando lixo", "encontrar imports não usados", "tirar código que não está em uso", "find unused code", "find dead code", "remove orphan files", "cleanup unused", "dependency cleanup", ou descrever que o projeto está com arquivos/código que não fazem mais sentido. Roda em modo Report-First (gera plano detalhado, espera aprovação, aplica com checkpoint git).
---

# Dead Code Cleanup

Você está atuando como auditor de qualidade de código com mandato de encontrar e remover lixo (arquivos órfãos, exports não usados, dependências não usadas, assets esquecidos, código comentado, código inalcançável). O foco é **JavaScript/TypeScript/React/Next.js**.

## Princípio fundamental: Report-First, Fix-After

**NUNCA delete nada sem antes:**
1. Gerar relatório completo com nível de confiança
2. Apresentar ao usuário e obter aprovação explícita
3. Criar um checkpoint git (branch + commit) antes de qualquer remoção
4. Remover em lotes pequenos com verificação entre eles

A regra de ouro: **"Quando em dúvida, mantenha. Falsos positivos custam menos que produção quebrada."**

## Quando usar

Ative quando o usuário usar frases como:
- "limpa o código morto", "varredura de lixo", "remove o que não está em uso"
- "find unused code/files/imports/dependencies"
- "dead code analysis", "cleanup the project"
- "this codebase is messy, can you clean it up"
- "tem muito arquivo que ninguém usa"
- "quero diminuir o tamanho do bundle removendo o que não uso"

Não ative quando:
- O usuário quer apenas refatorar (use refactor skills)
- O usuário quer revisar mudanças específicas (use code-review)
- O usuário descreve um bug específico (use functional-audit)

## Workflow (5 fases)

### Fase 1 — Reconhecimento

Antes de scanear, entenda o terreno:

```bash
# Detectar manager + framework
test -f package.json && cat package.json | head -40
test -f next.config.js -o -f next.config.mjs -o -f next.config.ts && echo "Next.js detected"
test -f vite.config.js -o -f vite.config.ts && echo "Vite detected"
test -f tsconfig.json && echo "TypeScript detected"
test -f pnpm-lock.yaml && echo "pnpm" || (test -f yarn.lock && echo "yarn") || echo "npm"

# Mapear estrutura
git ls-files | head -30
find . -type d -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*'
```

**Perguntas que você precisa responder antes de continuar:**
- É monorepo (turborepo, nx, lerna, pnpm workspaces)? Se sim, scane workspace por workspace.
- Tem `app/` (App Router) ou `pages/` (Pages Router)? Define o que conta como entry point.
- Tem `public/` com assets? Inclui na varredura.
- Existem dynamic imports (`import()`, `require()` com variável)? São fontes de falsos positivos.
- Existe algum gerador de código (codegen, prisma generate)? Esses arquivos parecem órfãos mas regeneram.

Anote essas descobertas — você vai precisar para configurar o knip.

### Fase 2 — Varredura paralela (use o subagent dead-code-scanner)

Delegue a varredura pesada para o subagent `dead-code-scanner`. Ele roda 6 passes em paralelo e retorna findings estruturados:

| Passe | Ferramenta | Encontra |
|---|---|---|
| 1 | `knip` (preferido) ou `ts-prune` | Arquivos não importados, exports não usados, deps não usadas, devDeps não usadas, duplicate exports |
| 2 | `depcheck` | Dependências em package.json sem uso real |
| 3 | `eslint --no-eslintrc --rule no-unused-vars` | Variáveis/imports não usados dentro de arquivos |
| 4 | `ripgrep` cross-reference | Componentes React exportados nunca importados |
| 5 | `ripgrep` para assets | Arquivos em `public/`, `assets/`, `static/` sem referência no código |
| 6 | `ripgrep` para mortos óbvios | Blocos `/* ... */` enormes, código atrás de `if (false)`, `// TODO: remover`, `// DEPRECATED` |

**Como invocar o knip (preferido sobre ts-prune — ts-prune está em manutenção):**

```bash
# Detecta tudo de uma vez sem precisar de config
npx knip --no-progress --reporter json > /tmp/knip-report.json 2>&1 || true

# Versão mais conservadora (só arquivos, não exports)
npx knip --no-progress --include files --reporter compact
```

Se knip falhar por falta de config, crie um `knip.json` mínimo:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["app/**/page.{ts,tsx}", "app/**/layout.{ts,tsx}", "app/**/route.{ts,tsx}", "pages/**/*.{ts,tsx}", "src/**/index.{ts,tsx}", "next.config.{js,ts,mjs}"],
  "project": ["**/*.{ts,tsx,js,jsx}"],
  "ignore": ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/*.d.ts"],
  "ignoreDependencies": []
}
```

**Atenção a falsos positivos clássicos no Next.js:**
- `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/route.tsx`, `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/not-found.tsx` — são entry points implícitos
- `middleware.ts` na raiz — entry implícito
- `pages/api/**/*.ts` — entry implícito (Pages Router)
- Imagens em `public/` referenciadas com path absoluto (`/logo.png`) — knip precisa de regex no projeto
- Componentes shadcn/ui em `components/ui/` — frequentemente importados via copy-paste futuro
- Arquivos `.d.ts` ambient — registram tipos globais
- Arquivos importados em config (`tailwind.config`, `postcss.config`, `drizzle.config`)

### Fase 3 — Classificação por confiança

Para cada finding, classifique em uma das três categorias:

**🟢 ALTA CONFIANÇA — auto-removível com aprovação em massa**
- Imports não usados dentro de um arquivo (eslint comprovou)
- `console.log` deixados no código (que não estão em arquivos de logging dedicados)
- Variáveis declaradas e nunca lidas
- DevDependencies não importadas em nenhum arquivo
- Comentários `// eslint-disable` em linhas que não dão mais warning

**🟡 MÉDIA CONFIANÇA — requer revisão item-a-item**
- Arquivos não importados detectados pelo knip
- Exports nomeados não usados
- Dependencies (não dev) não importadas — pode ser usado runtime via path string
- Componentes React não referenciados — pode ser dynamic import

**🔴 BAIXA CONFIANÇA — só sugerir, jamais remover sem confirmação manual**
- Arquivos em `public/` sem referência (podem ser linkados em CMS/banco)
- Arquivos com nomes "especiais" (`README`, `CHANGELOG`, `LICENSE`, `*.config.*`)
- Código atrás de feature flags
- Arquivos com `@deprecated` mas exportados publicamente (API contract)
- Qualquer coisa em `node_modules/`, `.next/`, `dist/`, `build/`

### Fase 4 — Apresentação do relatório

Sempre escreva o relatório em `./code-health-reports/dead-code-YYYY-MM-DD-HHMM.md`. Estrutura:

```markdown
# Dead Code Report — <data>

## Resumo executivo
- Tamanho atual do projeto: X arquivos, Y MB
- Findings: A alta confiança, B média, C baixa
- Economia potencial: ~Z arquivos removíveis (~W KB)
- Tempo estimado para aplicar tudo: ~N min

## 🟢 Alta confiança (123 itens)
### Imports não usados (89)
| Arquivo | Linha | Símbolo | Ação |
|---|---|---|---|
| src/foo.ts | 3 | `lodash` | remover import |
...
### console.log esquecidos (34)
...

## 🟡 Média confiança (45 itens)
### Arquivos não importados (23)
- `src/components/OldButton.tsx` — último commit há 8 meses, 0 referências encontradas via ripgrep, knip confirma. **Risco:** pode ser dynamic import. Verifique antes.
- ...

## 🔴 Baixa confiança (12 itens)
### Assets em public/ (8)
- ...

## Plano de execução proposto
1. Branch: `cleanup/dead-code-YYYY-MM-DD`
2. Lote 1 (alta confiança, automático): 123 itens — `git commit -m "chore: remove unused imports and console.logs"`
3. Lote 2 (média, item-a-item): aprovar arquivo por arquivo
4. Lote 3 (baixa, só após confirmação manual)
5. Verificação: `pnpm build && pnpm test && pnpm typecheck`
6. Se quebrar: `git reset --hard <checkpoint>`
```

Depois de escrever o relatório, **pare** e mostre o resumo executivo + caminho do arquivo ao usuário. Pergunte:
> "Relatório salvo em `./code-health-reports/...`. Quer que eu aplique o Lote 1 (alta confiança, X itens)? Ou prefere revisar tudo primeiro?"

### Fase 5 — Aplicação segura

**Antes de qualquer remoção:**

```bash
# Checkpoint
git status --porcelain  # garantir working tree limpo
git checkout -b "cleanup/dead-code-$(date +%Y-%m-%d)"
git rev-parse HEAD > .code-health-checkpoint  # salvar SHA original
```

**Aplicação por lote:**

Para cada item do lote aprovado:
1. Aplique a remoção (Edit ou bash `rm`)
2. Após cada ~20 itens ou cada arquivo deletado, rode verificação rápida:
   ```bash
   npx tsc --noEmit 2>&1 | head -20
   ```
3. Se houver erro, **PARE**, reverta o último item, marque como falso positivo, continue
4. Após o lote completo, rode verificação completa:
   ```bash
   pnpm build 2>&1 | tail -30 || npm run build 2>&1 | tail -30
   pnpm test --run 2>&1 | tail -20 || true   # testes podem ser opcionais
   pnpm lint 2>&1 | tail -20 || true
   ```
5. Se tudo passar:
   ```bash
   git add -A
   git commit -m "chore(cleanup): remove dead code — lote 1 (alta confiança)
   
   - Removidos N imports não usados
   - Removidos M console.log
   - Detalhes em code-health-reports/<arquivo>.md"
   ```
6. Se algo quebrar:
   ```bash
   git reset --hard "$(cat .code-health-checkpoint)"
   ```
   Depois reporte ao usuário com diagnóstico.

**Ao final**, atualize o relatório com a seção "## Aplicado em <data>" listando exatamente o que foi removido e o SHA do commit.

## Regras de segurança não negociáveis

1. **Nunca remova sem checkpoint git.** Se o working tree estiver sujo, peça ao usuário para fazer commit/stash antes.
2. **Nunca remova mais de 50 arquivos em um único commit.** Quebre em lotes.
3. **Nunca remova arquivos sem rodar pelo menos `tsc --noEmit` depois.**
4. **Nunca toque em:** `.git/`, `node_modules/`, `.next/`, `dist/`, `build/`, `coverage/`, `.turbo/`, `.cache/`, lockfiles.
5. **Sempre prefira `git rm`** sobre `rm` para que apareça no histórico.
6. **Se o projeto não tiver testes nem build configurado**, avise o usuário e exija dupla confirmação antes de remover qualquer arquivo (não apenas imports).
7. **Se o usuário disser "remova tudo de alta confiança automaticamente"**, ainda assim crie a branch e o commit separado por categoria — nunca merge direto na main.
8. **Antes de remover uma dependência do package.json**, verifique também `next.config.*`, `tailwind.config.*`, `vite.config.*`, `*.config.cjs/mjs` — bibliotecas de plugin podem ser importadas em config.

## Patterns específicos do Next.js (não trate como dead code)

| Padrão | Por que parece morto | Por que não é |
|---|---|---|
| `app/**/page.tsx` | Não tem export importado | Next.js renderiza por convenção de pasta |
| `app/**/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` | Idem | Convenção do App Router |
| `app/api/**/route.ts` | Idem | Endpoint da API |
| `middleware.ts` | Idem | Hook do edge runtime |
| `instrumentation.ts` | Idem | Hook de telemetria |
| Server Actions (`'use server'`) | Função não importada visível | Invocada via form action ou client component |
| `generateStaticParams`, `generateMetadata` | Funções não chamadas explicitamente | Next.js chama via convenção |
| Componentes em `components/ui/` (shadcn) | Importados poucas vezes | Geralmente intencional como biblioteca local |
| Imagens em `public/` | Sem import | Referenciadas via path string |

Sempre adicione esses paths ao `entry` do knip antes de scanear.

## Quando usar referências externas

Se a varredura precisar de mais detalhe, leia:
- `references/tools-reference.md` — comandos completos de knip, ts-prune, depcheck, eslint
- `references/safety-rules.md` — checklist de segurança expandido

## Resultado final esperado

Após executar este skill, o usuário deve ter:
1. Um relatório em `code-health-reports/dead-code-<timestamp>.md` com tudo categorizado
2. Uma branch `cleanup/dead-code-<data>` com commits separados por confiança
3. Verificação de que `tsc`, `build` e (se existir) `test` continuam passando
4. Capacidade de reverter qualquer lote individualmente via git
