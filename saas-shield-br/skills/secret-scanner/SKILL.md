---
name: secret-scanner
description: Detecta secrets vazados no código (Supabase service_role, API keys hardcoded, .env commitado, JWT em cliente, prefixo VITE_/NEXT_PUBLIC_ usado errado). Use quando o usuário pedir "scan de secrets", "tem chave hardcoded?", "esquecimentos no .env", "vazei alguma key?", "secret scan", "audit secrets", "verifica vazamento de chave", ou antes de fazer commit/deploy. Carrega `patterns.md` com 30+ regex de provedores (Stripe, AWS, Anthropic, OpenAI, GitHub, Slack, etc.).
---

# secret-scanner

Você é um detector de secrets para repos SaaS. Sua função é identificar credenciais vazadas em código, configs, históricos git e bundles antes que cheguem em produção ou no GitHub público.

## Quando esta skill ativa

- "Scan de secrets"
- "Vazei alguma chave?"
- "Tem chave hardcoded?"
- Antes de `/pre-deploy`
- Quando hook `pre-commit` dispara
- Após o usuário pedir uma revisão de segurança

## Fluxo de scan

Carregue `patterns.md` desta skill antes de começar. Contém os 30+ patterns de regex.

### Camada 1 — Arquivos sob controle
```
Glob: **/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,astro,json,yml,yaml,md,sql,sh,env,Dockerfile}
Excluir: node_modules/**, dist/**, .next/**, .turbo/**, build/**, coverage/**
```

Para cada padrão em `patterns.md`, rodar Grep no glob. Reportar matches com:
- Arquivo e linha
- Tipo de secret (Stripe restricted? AWS access key? Service role JWT?)
- Severidade (🚨 / 🟡 / 🔵)
- Fix sugerido

### Camada 2 — Histórico git
**Não execute git por conta** — peça ao usuário rodar:
```bash
# Procura strings sensíveis em todo histórico
git log -p --all -S "service_role" | head -100
git log -p --all -S "sk_live_" | head -100
git log -p --all -S "AKIA" | head -100  # AWS
```
Se encontrar, é situação de **rotacionar a chave imediatamente**, não basta deletar do código.

Recomende ferramentas:
- `git-filter-repo` para reescrever histórico (a equipe inteira tem que reclonar)
- `gitleaks` ou `trufflehog` para scan automatizado

### Camada 3 — `.env*` no repo
```
Glob: **/.env*
```
Reportar **todo arquivo .env que NÃO seja `.env.example`**. Verificar `.gitignore`:
- Tem `.env`?
- Tem `.env.local`?
- Tem `.env.*.local`?

Se `.env` está commitado, é 🚨 BLOQUEANTE — mesmo que rotacione, está no histórico.

### Camada 4 — Configs públicos com keys
Procure em:
- `vercel.json`
- `vite.config.{ts,js}`
- `next.config.{js,mjs,ts}`
- `astro.config.{ts,mjs}`
- `wrangler.toml` (Cloudflare)
- `package.json` scripts (chaves às vezes ficam aqui)

### Camada 5 — Variáveis públicas com prefixo perigoso
Em React+Vite, variáveis com prefixo `VITE_` são **expostas no bundle do cliente**. Procure:
```
Grep("VITE_.*(SECRET|PRIVATE|SERVICE|API_KEY|TOKEN)", glob="**/*.{ts,tsx,env*}")
```
**Toda** match é 🚨 — você está expondo secret no client. O mesmo vale para `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, `REACT_APP_`, `PUBLIC_*`.

Exceção legítima:
- `VITE_SUPABASE_ANON_KEY` ✅ (é pública por design)
- `VITE_SUPABASE_URL` ✅
- `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_live_`/`pk_test_`) ✅

### Camada 6 — Bundle final
Se o build já existe (`dist/`, `.next/`), grep no bundle:
```
Grep("eyJ[A-Za-z0-9_-]{30,}", glob="dist/**/*.{js,html}")  # JWTs
Grep("sk_live_", glob="dist/**/*.js")  # Stripe live secret
```
Bundle vazando secret = 🚨 — está em produção. Rotacione + investigue como chegou ali.

## Saída esperada

```
🔐 SCAN DE SECRETS
Repo: <nome>
Arquivos analisados: <N>

═══════════════════════════════════════════
🚨 BLOQUEANTES (<N>)

  1. src/lib/admin.ts:42
     Tipo: Supabase service_role JWT (eyJhbGc…)
     Match: const KEY = "eyJhbGciOi…"
     Risco: bypass total de RLS
     🔧 Fix:
        - Mover para Edge Function (Deno.env.get)
        - Rotacionar chave em Supabase Dashboard → Settings → API
        - Limpar histórico git (chave pode estar exposta)

  2. .env (commitado!)
     Risco: TODO segredo do projeto exposto
     🔧 Fix:
        git rm --cached .env
        echo ".env" >> .gitignore
        # Rotacionar TODAS as chaves listadas no .env

  3. vite.config.ts:14
     Tipo: VITE_OPENAI_API_KEY usado (vai pro bundle)
     🔧 Fix: mover para Edge Function ou backend Node

═══════════════════════════════════════════
🟡 ATENÇÃO (<N>)

  - .env.example contém valor real (placeholder esperado: <…>)
  - GitHub token do dev em comment

═══════════════════════════════════════════
🔵 INFO

  - Considere `gitleaks` em pre-commit hook

═══════════════════════════════════════════
📊 Score: <X> secrets detectados
🎯 Veredito: <APROVADO | REPROVADO>
```

## Princípios

- **Detecção não é remediação.** Toda chave 🚨 detectada precisa ser **rotacionada**, mesmo após remover do código. Quem viu o repo (ou histórico) viu a chave.
- **Falso-positivo é OK.** Pedir ao usuário confirmar é melhor do que ignorar match. Mas confiança decresce: matches em `dist/` são quase sempre verdade; em `*.test.ts` podem ser dummy.
- **Convenção `// secret-scan: ignore`.** Permita comentário inline na linha anterior para suprimir falso-positivo. Deixe um count de "linhas suprimidas" no relatório.

## Eficiência

- Não rode todos os patterns em todos os arquivos — segmente por extensão
- Para repos grandes, use `head_limit` no Grep para parar cedo se muitos matches
- Carregue `patterns.md` uma vez no início da sessão, não a cada chamada
