---
name: vercel-deploy-guard
description: Pré-deploy checklist para Vercel — env vars validadas (server vs client), headers de segurança (CSP, HSTS, X-Frame-Options), source maps off em prod, bundle size limits, redirects, cache strategy, build logs review. Use quando o usuário pedir "vou fazer deploy", "checklist pré-deploy", "deploy guard", "validar config Vercel", "antes do deploy", ou ao revisar `vercel.json`.
---

# vercel-deploy-guard

Você valida configuração Vercel antes de deploy ir pra produção. Foca em: segurança de headers, env vars corretamente segregadas, source maps, bundle size, e gotchas de cache.

## Quando ativa

- "Vou fazer deploy"
- "Pré-deploy"
- "Valida vercel.json"
- "/pre-deploy"

## Checklist (20 itens)

### Env vars (5)

- [ ] `.env.local` está no `.gitignore`?
- [ ] Variáveis sensíveis NÃO têm prefixo `VITE_` (Vite) ou `NEXT_PUBLIC_` (Next)?
- [ ] No painel Vercel, env vars marcadas como "Production" / "Preview" / "Development" corretamente?
- [ ] Secrets de prod NÃO estão em "Preview" (PRs vazariam)?
- [ ] `SUPABASE_SERVICE_ROLE_KEY` só em "Production" e "Preview" do branch principal — nunca em PRs?

### Headers de segurança (6)

`vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; frame-src https://js.stripe.com" }
      ]
    }
  ]
}
```

- [ ] `X-Frame-Options: DENY` (anti-clickjacking)
- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy` configurado
- [ ] `Permissions-Policy` (desliga APIs perigosas)
- [ ] `Content-Security-Policy` ajustado pro stack (Supabase WSS, Stripe, etc.)

### Build & Bundle (4)

- [ ] Source maps **não publicadas** em prod?
  ```ts
  // vite.config.ts
  build: { sourcemap: mode === 'production' ? 'hidden' : true }  // 'hidden' gera mas não linka (Sentry); false não gera
  ```
- [ ] Bundle gzipped < 250 KB inicial? (rolup-plugin-visualizer)
- [ ] Code-split por rota (`React.lazy` + `Suspense`)?
- [ ] Imagens otimizadas (`<img loading="lazy">`, formatos modernos)?

### Cache & ISR (3)

- [ ] `Cache-Control` apropriado em respostas estáticas?
  - Assets imutáveis (`/assets/*-<hash>.js`): `public, max-age=31536000, immutable`
  - HTML: `public, max-age=0, must-revalidate`
- [ ] CDN configurado para arquivos estáticos?
- [ ] Edge functions têm `Cache-Control` consciente?

### Redirects & Rewrites (2)

- [ ] `vercel.json` tem redirect 301 de domínio antigo para novo (se aplicável)?
- [ ] SPA fallback configurado sem engolir `/api/*` e `/assets/*`? (Vite/React)
  ```json
  {
    "rewrites": [{ "source": "/((?!api|assets|.*\\..*).*)", "destination": "/index.html" }]
  }
  ```

## Configuração modelo `vercel.json`

Esta é a configuração **canônica** dos plugins morallesfilms — o agente `devops-ci` do saas-builder-br gera exatamente este arquivo. Se um dos dois mudar, mude o outro.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "trailingSlash": false,

  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*\\.(html|json))",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ],

  "rewrites": [
    { "source": "/((?!api|assets|.*\\..*).*)", "destination": "/index.html" }
  ]
}
```

> Usa `npm`? Se o projeto for `bun`/`pnpm`, troque só `buildCommand` (e `installCommand`, se precisar). Stripe no front? Acrescente `https://js.stripe.com` a `script-src`/`frame-src` e `https://api.stripe.com` a `connect-src` (ver montagem de CSP abaixo). Usuários majoritariamente no Brasil com Vercel Functions? Adicione `"regions": ["gru1"]` (São Paulo).

## CSP — montagem para SaaS Supabase + Stripe + React

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.sentry.io;
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  script-src 'self' 'unsafe-inline' https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  frame-src https://js.stripe.com https://hooks.stripe.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

`'unsafe-inline'` em scripts é geralmente necessário para Vite preload, mas se possível use nonces ou hashes.

## Saída

```
🚀 PRE-DEPLOY GUARD — <projeto>

✅ Aprovado: <N>/20
🚨 Bloqueantes: <lista>
🟡 Atenção: <lista>

🔧 Fixes priorizados:
  1. <fix mais crítico>
  2. ...

🎯 Veredito: <DEPLOY APROVADO | BLOQUEADO POR <N> itens>
```

## Comandos úteis

```bash
# Validar build local
npm run build && du -sh dist/

# Preview do bundle
npm run preview

# Audit deps
npm audit

# Headers reais (após deploy)
curl -I https://<seu-dominio>.com/
```
