---
name: vite-react-arquitetura
description: Estrutura de pastas + arquivos canônicos para iniciar um novo SaaS Vite + React + TypeScript multi-tenant. Use ao bootstrar projeto novo do zero, ou ao avaliar se um projeto existente segue a arquitetura padrão. Gera scaffold completo de src/, configs (vite, tailwind, tsconfig), e arquivos críticos (client Supabase único, env validado com Zod, query client, router com guards).
---

# Vite + React + TypeScript — arquitetura canônica para SaaS multi-tenant

## Quando usar

- Bootstrapping de SaaS novo do zero
- Auditando projeto existente para identificar desvios da arquitetura padrão
- Refatorando projeto que cresceu sem estrutura definida

## Estrutura de pastas obrigatória

```
<projeto>/
├── public/                          # estáticos (favicon, robots.txt)
├── src/
│   ├── app/
│   │   ├── router.tsx               # createBrowserRouter + guards
│   │   ├── providers.tsx            # QueryClient + Auth + Theme
│   │   ├── root-layout.tsx          # AppShell (sidebar + header)
│   │   └── error-boundary.tsx
│   ├── features/                    # 1 pasta por módulo do projeto
│   │   └── <feature>/
│   │       ├── pages/               # rotas (LoginPage, DashboardPage)
│   │       ├── components/          # componentes específicos da feature
│   │       ├── hooks/               # useLogin, useInvoiceList
│   │       ├── api.ts               # chamadas Supabase da feature
│   │       └── types.ts
│   ├── components/
│   │   ├── ui/                      # primitives (Button, Input, Dialog) — design-ux povoa
│   │   └── shared/                  # cross-feature (TenantSwitcher, Avatar)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # ÚNICO createClient
│   │   │   └── types.ts             # gerado: supabase gen types typescript
│   │   ├── query/
│   │   │   ├── client.ts            # QueryClient + defaults
│   │   │   └── keys.ts              # factory hierárquica com tenant
│   │   ├── env.ts                   # Zod schema das VITE_*
│   │   ├── cn.ts                    # twMerge + clsx
│   │   └── format.ts                # date, currency BR
│   ├── stores/                      # Zustand (UI global apenas)
│   │   ├── ui-store.ts
│   │   └── theme-store.ts
│   ├── styles/
│   │   ├── tokens.css               # CSS vars light + dark
│   │   └── globals.css              # @tailwind + reset
│   ├── types/
│   │   └── domain.ts                # tipos compartilhados
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── tests/                           # qa-testes detalha
├── supabase/                        # backend-supabase + db-schema-designer
│   ├── migrations/
│   ├── functions/
│   └── config.toml
├── .env.example                     # template (sem valores)
├── .env.local                       # local dev (no .gitignore!)
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json                      # devops-ci configura
└── vite.config.ts
```

## Arquivos críticos — conteúdo canônico

### `package.json` — dependências mínimas

```json
{
  "name": "<projeto>",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-query-devtools": "^5.59.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^6.27.0",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@tailwindcss/forms": "^0.5.9",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.13.0",
    "eslint-plugin-react": "^7.37.2",
    "eslint-plugin-react-hooks": "^5.0.0",
    "jsdom": "^25.0.1",
    "msw": "^2.6.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

### `tsconfig.json` — strict + paths

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `.env.example` (template público)

```bash
# Frontend (vai pro bundle — VITE_ prefix obrigatório)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_NAME=Meu SaaS

# Edge Functions (NUNCA aqui, usa supabase secrets set)
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
```

### `.gitignore` — mínimo

```
node_modules
dist
dist-ssr
*.local
.env
.env.local
.env.*.local

# Vercel
.vercel

# Supabase
supabase/.branches
supabase/.temp

# Tests
coverage
playwright-report
test-results

# Editor
.vscode/*
!.vscode/extensions.json
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

## Bootstrap em 5 comandos

```bash
# 1. Cria projeto Vite
npm create vite@latest meu-saas -- --template react-ts
cd meu-saas

# 2. Instala dependências canônicas
npm i @supabase/supabase-js @tanstack/react-query @tanstack/react-query-devtools \
      react-router-dom react-hook-form zod @hookform/resolvers zustand \
      class-variance-authority clsx tailwind-merge lucide-react \
      @radix-ui/react-dialog @radix-ui/react-slot

npm i -D tailwindcss postcss autoprefixer @tailwindcss/forms \
      @testing-library/react @testing-library/jest-dom @testing-library/user-event \
      vitest jsdom msw @playwright/test

# 3. Tailwind init
npx tailwindcss init -p

# 4. Inicia Supabase local
npx supabase init

# 5. Gera tipos do banco
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```

## Verificação rápida da arquitetura

Rode esses Greps. Cada match é red flag:

```bash
# Múltiplos createClient (deveria ser só 1)
grep -rn "createClient" src/ | grep -v "src/lib/supabase/client.ts"

# Service role no client
grep -rn "service_role\|SERVICE_ROLE_KEY" src/

# fetch() direto pra OpenAI/Anthropic/Gemini do frontend
grep -rn "api.openai\|api.anthropic\|generativelanguage.googleapis" src/

# process.env (deveria ser import.meta.env)
grep -rn "process.env" src/

# any em retorno de hook
grep -rn ": any" src/lib src/features
```
