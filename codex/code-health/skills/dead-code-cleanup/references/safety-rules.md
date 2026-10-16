# Regras de segurança expandidas

Carregue se houver dúvida sobre segurança da remoção.

## Pré-flight checklist (antes de qualquer remoção)

- [ ] `git status --porcelain` retorna vazio (working tree limpo) — se não, pedir ao usuário para commit/stash
- [ ] `git rev-parse --abbrev-ref HEAD` ≠ `main`/`master`/`production` (criar branch nova se estiver em uma protegida)
- [ ] `git log -1 --format=%H` salvo em variável (`CHECKPOINT=$(git rev-parse HEAD)`)
- [ ] Existe pelo menos um dos: `pnpm build`, `npm run build`, `yarn build`
- [ ] TypeScript projeto: `npx tsc --noEmit` roda sem erros (estado base limpo)
- [ ] Lockfile presente e atualizado (`pnpm-lock.yaml`/`package-lock.json`/`yarn.lock`)

Se algum item falhar, **NÃO PROSSIGA**. Reporte ao usuário e peça correção primeiro.

## Pastas e arquivos intocáveis

Nunca, em hipótese alguma, remova ou edite:

- `.git/`
- `node_modules/`, `.pnpm-store/`, `.yarn/`
- `.next/`, `out/`, `dist/`, `build/`, `.vercel/`, `.netlify/`
- `coverage/`, `.nyc_output/`
- `.turbo/`, `.cache/`, `.parcel-cache/`
- Lockfiles (`*-lock.json`, `*.lock`, `*-lock.yaml`)
- Arquivos com nomes "especiais": `LICENSE*`, `CHANGELOG*`, `CODE_OF_CONDUCT*`, `CONTRIBUTING*`, `SECURITY*`
- `.gitignore`, `.gitattributes`, `.editorconfig`
- Arquivos de CI/CD: `.github/workflows/`, `.gitlab-ci.yml`, `circle.yml`, `azure-pipelines.yml`
- Arquivos de Docker: `Dockerfile*`, `docker-compose*.yml`, `.dockerignore`
- Arquivos `.env*` (ainda que pareçam vazios — podem estar listados em `.gitignore` por design)

## Patterns Next.js que parecem mortos mas NÃO são

Antes de marcar como dead code, verifique se o caminho do arquivo bate com algum destes patterns:

```regex
^(app|src/app)/.*?/(page|layout|loading|error|not-found|template|default|head)\.(ts|tsx|js|jsx)$
^(app|src/app)/.*?/route\.(ts|tsx|js|jsx)$
^(pages|src/pages)/.*?\.(ts|tsx|js|jsx)$
^(pages|src/pages)/api/.*?\.(ts|js)$
^(src/)?middleware\.(ts|js)$
^(src/)?instrumentation\.(ts|js)$
^next\.config\.(js|ts|mjs)$
^(tailwind|postcss|prettier|eslint|jest|vitest|playwright|cypress)\.config\.(js|ts|cjs|mjs)$
^drizzle\.config\.(ts|js)$
^prisma/schema\.prisma$
\.d\.ts$  # ambient declarations
```

Se um arquivo bater com qualquer um destes, classifique como 🔴 baixa confiança e nunca remova automaticamente.

## Verificação após cada lote

Sempre rode na ordem:

1. `npx tsc --noEmit` — pega 80% dos breaks instantaneamente
2. `pnpm build` (ou equivalente) — pega problemas de runtime/SSR
3. `pnpm test --run` — pega regressões de comportamento (opcional, se tiver testes)
4. `pnpm lint` — pega regressões de estilo (opcional)

Se qualquer um falhar:

```bash
# Diagnóstico antes de reverter
git diff --stat HEAD~1

# Reverter
git reset --hard "$CHECKPOINT"

# Reportar para o usuário com:
# - Comando que falhou
# - Output do erro (últimas 30 linhas)
# - Lista de arquivos que estavam sendo removidos
# - Sugestão de qual arquivo provavelmente causou o break
```

## Tamanho máximo por commit

Por experiência: commits de cleanup com mais de 50 arquivos são impossíveis de revisar, e quando algo quebra você não sabe qual arquivo foi a causa. Limites:

- **🟢 Alta confiança (imports/console.log)**: até 200 mudanças/commit, mas separe por TIPO (um commit só de `unused-imports`, outro só de `console.log`)
- **🟡 Média confiança (arquivos)**: máximo 20 arquivos/commit
- **🔴 Baixa confiança (assets, configs)**: 1 a 5 arquivos/commit, com mensagem detalhada do porquê

## Sinal de "não remova" — comentários do desenvolvedor

Se um arquivo ou função tiver qualquer um destes comentários, NUNCA remova sem confirmação explícita do usuário:

```
@public
@external
@api
@keep
@noinspection
@used-by-runtime
// Used in CMS / banco / config externa
// Loaded dynamically
// Referenced by webhook / external service
```

## Recuperação se algo der errado em produção

Se o usuário deployar a branch de cleanup e algo quebrar em produção:

```bash
# 1. Reverter o deploy (Vercel)
vercel rollback

# 2. Reverter o commit no git
git revert <SHA-do-cleanup-commit>
git push origin main

# 3. Investigar
# Olhar logs de produção, identificar arquivo/símbolo que está sendo procurado
# Restaurar APENAS aquele arquivo: git checkout HEAD~1 -- path/to/file
```

## Quando NÃO confiar em knip / ts-prune / depcheck

Estas situações geram falsos positivos sistêmicos. Se o projeto tiver qualquer uma delas, force classificação 🔴 para arquivos:

- Uso intensivo de `dynamic(import())` no Next.js
- Uso de `import()` com path em variável (`import(\`./locales/\${lang}.ts\`)`)
- Plugins de bundler com transformações em string (ex: stuff que vira import path em build time)
- Macros / babel transforms que injetam imports
- Reflexão / `Function('return ...')`, `eval`
- Storybook stories carregados via glob no `.storybook/main.ts`
- Test files carregados via glob (Jest/Vitest/Playwright)
- Arquivos referenciados em `package.json` `bin`, `exports`, `main`, `types`

Em qualquer um desses casos, faça whitelist no knip e seja extremamente conservador.
