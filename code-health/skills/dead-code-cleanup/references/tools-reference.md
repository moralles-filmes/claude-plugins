# Ferramentas de detecção — referência completa

Carregue este arquivo apenas quando precisar de comandos exatos. Não está no SKILL.md base para economizar context.

## knip (ferramenta primária — preferida sobre ts-prune)

`ts-prune` foi para modo manutenção; `knip` é o sucessor recomendado pelo próprio autor da Effective TypeScript.

### Instalação on-the-fly (sem persistir no projeto)

```bash
npx --yes knip@latest --no-progress --reporter compact
```

### Reporters úteis

```bash
npx knip --reporter compact            # leitura humana
npx knip --reporter json > knip.json   # parsing programático
npx knip --reporter markdown > knip.md # commit-friendly
```

### Filtragem por tipo de finding

```bash
npx knip --include files                              # só arquivos não usados
npx knip --include exports                            # só exports não usados
npx knip --include dependencies                       # só deps não usadas
npx knip --include duplicates                         # só duplicate exports
npx knip --include unlisted                           # imports sem dependência declarada
```

### Configuração mínima recomendada para Next.js (App Router)

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "app/**/page.{ts,tsx,js,jsx}",
    "app/**/layout.{ts,tsx,js,jsx}",
    "app/**/route.{ts,tsx,js,jsx}",
    "app/**/loading.{ts,tsx,js,jsx}",
    "app/**/error.{ts,tsx,js,jsx}",
    "app/**/not-found.{ts,tsx,js,jsx}",
    "app/**/template.{ts,tsx,js,jsx}",
    "app/**/default.{ts,tsx,js,jsx}",
    "middleware.{ts,js}",
    "instrumentation.{ts,js}",
    "next.config.{js,ts,mjs}"
  ],
  "project": ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  "ignore": [
    "**/*.d.ts",
    "**/.next/**",
    "**/node_modules/**",
    "**/coverage/**"
  ],
  "ignoreDependencies": [
    "@types/.*",
    "eslint-.*",
    "prettier",
    "husky"
  ],
  "next": true,
  "tailwind": true
}
```

Para Pages Router, troque o array `entry` por `["pages/**/*.{ts,tsx}", "pages/api/**/*.ts"]`.

Para monorepo, use `workspaces` em vez de `entry`/`project`.

### Plugins que knip detecta automaticamente

knip 5 detecta automaticamente: Next.js, Vite, Vitest, Jest, Cypress, Playwright, Storybook, Tailwind, Prisma, ESLint, Prettier, TypeScript, Astro, Remix, SvelteKit, Nuxt. Se algum desses estiver no `package.json`, knip ajusta os entry points sem config manual.

## ts-prune (legado — só usar se knip falhar)

```bash
npx ts-prune -p tsconfig.json
npx ts-prune --error  # exit code != 0 se achar findings
```

Limitações conhecidas:
- Não detecta deps não usadas
- Não entende dynamic imports
- Não detecta dead code mutuamente recursivo
- Marca código de teste como "in use" mesmo se o teste só testa código morto

## depcheck (cobertura adicional para package.json)

```bash
npx depcheck --json > /tmp/depcheck.json
npx depcheck --skip-missing  # mais rápido
```

depcheck é melhor que knip para uma coisa: detecta `require()` com strings dinâmicas. Use os dois e cruze os resultados.

### Combinando knip + depcheck

```bash
npx knip --include dependencies --reporter json > /tmp/knip-deps.json
npx depcheck --json > /tmp/depcheck.json

# Dependências sinalizadas pelos DOIS = altíssima confiança
jq -r '.unused.devDependencies[]' /tmp/depcheck.json | sort > /tmp/depcheck-dev.txt
jq -r '.issues[] | select(.devDependencies != null) | .devDependencies[].name' /tmp/knip-deps.json | sort > /tmp/knip-dev.txt
comm -12 /tmp/depcheck-dev.txt /tmp/knip-dev.txt   # interseção = altíssima confiança
```

## eslint para imports/variáveis não usados (granular por arquivo)

```bash
# Sem usar config do projeto
npx eslint --no-eslintrc \
  --parser-options 'ecmaVersion:latest,sourceType:module,ecmaFeatures:{jsx:true}' \
  --parser '@typescript-eslint/parser' \
  --plugin '@typescript-eslint' \
  --rule '{"@typescript-eslint/no-unused-vars": "error"}' \
  'src/**/*.{ts,tsx}' --format json > /tmp/eslint.json

# Com config do projeto + auto-fix dos imports
npx eslint --fix --rule '{"unused-imports/no-unused-imports": "error"}' src/
```

Plugin auxiliar: `eslint-plugin-unused-imports` faz auto-fix mais agressivo que o regular `no-unused-vars`.

## ripgrep para cross-reference manual

Quando knip diz "este arquivo é exportado mas nunca usado", confirme manualmente:

```bash
# Buscar todas as referências a um símbolo (incluindo strings)
rg -n -t ts -t tsx -t js -t jsx 'OldButton' --glob '!node_modules' --glob '!.next' --glob '!dist'

# Buscar imports de um arquivo (path absoluto e relativo)
rg -n "from ['\"](.*?)/OldButton" --glob '!node_modules'
rg -n "import\\(['\"](.*?)/OldButton" --glob '!node_modules'  # dynamic imports

# Buscar referências por path em strings (Next.js dynamic routes, etc.)
rg -n "/old-button" --glob '!node_modules'
```

Regra prática: se ripgrep não encontrar nenhuma referência mesmo procurando em strings, é seguro remover.

## Detector de assets órfãos em public/

```bash
# Listar todos os assets
find public -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.svg' -o -name '*.webp' -o -name '*.gif' -o -name '*.ico' -o -name '*.pdf' \) > /tmp/all-assets.txt

# Para cada um, ver se aparece em algum lugar
while read asset; do
  filename=$(basename "$asset")
  pathname=${asset#public}
  count=$(rg -c -F "$filename" --glob '!public' --glob '!node_modules' --glob '!.next' 2>/dev/null | wc -l)
  if [ "$count" -eq 0 ]; then
    pathcount=$(rg -c -F "$pathname" --glob '!public' --glob '!node_modules' --glob '!.next' 2>/dev/null | wc -l)
    if [ "$pathcount" -eq 0 ]; then
      echo "ORPHAN: $asset"
    fi
  fi
done < /tmp/all-assets.txt
```

**Atenção:** assets podem ser referenciados por nome construído dinamicamente (`/icons/${type}.svg`), em CMS, ou em variáveis de ambiente. Sempre classifique como 🔴 baixa confiança.

## Detector de código comentado (blocos grandes)

```bash
# Blocos /* ... */ com mais de 5 linhas
rg -U --multiline '/\*[\s\S]{200,}?\*/' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'

# Comentários // em sequência (5+ linhas)
rg -U --multiline '(^\s*//.*\n){5,}' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'
```

## Detector de TODOs antigos

```bash
# TODOs com mais de 6 meses (último commit que tocou no comentário)
rg -n 'TODO|FIXME|XXX|HACK|@deprecated' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' \
  | while IFS=: read file line rest; do
      author_date=$(git log -1 --format='%ad' --date=short -L "${line},${line}:${file}" 2>/dev/null)
      echo "$author_date | $file:$line | $rest"
    done | sort
```

## Build/test smoke check (rodar SEMPRE antes de commitar remoções)

```bash
# TypeScript
npx tsc --noEmit

# Build (Next.js)
pnpm build || npm run build || yarn build

# Test (se existir)
pnpm test --run --passWithNoTests 2>/dev/null || \
  npx vitest run --passWithNoTests 2>/dev/null || \
  npx jest --passWithNoTests 2>/dev/null || true

# Lint
pnpm lint 2>/dev/null || npm run lint 2>/dev/null || true
```

Se qualquer um falhar, **reverta o último lote** e reporte.
