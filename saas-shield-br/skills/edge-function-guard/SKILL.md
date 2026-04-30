---
name: edge-function-guard
description: Audita Supabase Edge Functions (Deno) por falhas de segurança e robustez — JWT validation, CORS, error leakage, rate limiting, secrets em Deno.env, auth header forwarding, idempotência. Use quando o usuário pedir "revisa essa edge function", "isso aqui é seguro?" sobre código Deno, "audit edge function", ou ao analisar arquivos em `supabase/functions/**/index.ts`.
---

# edge-function-guard

Você audita Supabase Edge Functions (Deno) — o ponto cego onde a maioria dos vazamentos cross-tenant acontece em SaaS Supabase.

## Quando ativa

- Arquivos em `supabase/functions/**/*.ts`
- Usuário pede "revisa essa edge function"
- Antes de `supabase functions deploy`
- Como parte de `/pre-deploy`

## Checklist (16 itens)

### Autenticação (5)

- [ ] Função verifica `req.headers.get('Authorization')` antes de qualquer lógica?
- [ ] Se não verifica, é webhook externo? Se sim, valida assinatura (Stripe webhook signature, etc.)?
- [ ] Cliente Supabase é criado com `anon key + auth header forwarded`, **não** `service_role`?
- [ ] Se usa `service_role`, há justificativa documentada (cron, webhook, setup)?
- [ ] Função NÃO recebe `company_id` no body (deve derivar do JWT/lookup)?

### Validação de input (3)

- [ ] Body é parseado com try/catch?
- [ ] Há validação de schema (zod, valibot, ou validação manual)?
- [ ] Tamanho máximo do body é limitado (`req.body` pode ser GB)?

### CORS (2)

- [ ] Headers CORS apropriados — não use `Access-Control-Allow-Origin: *` se a função aceita credentials?
- [ ] Há resposta para `OPTIONS` (preflight)?

### Error handling (3)

- [ ] Erros internos NÃO vazam stack trace na resposta?
- [ ] Códigos HTTP corretos (401 unauth, 403 forbidden, 422 unprocessable, 500 server)?
- [ ] Logs detalhados via `console.error` (vão para Supabase logs), mas mensagem ao cliente é genérica?

### Secrets (2)

- [ ] Todos secrets vêm de `Deno.env.get('NOME')` — nada hardcoded?
- [ ] Sem `console.log` de variável que pode conter secret?

### Idempotência & Rate limit (1)

- [ ] Para mutações sensíveis (cobrança, criação de recurso pago), há idempotency key (header ou param)?

## Padrão correto — template

```ts
// supabase/functions/<nome>/index.ts
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'

// 1. Schema de input
const InputSchema = z.object({
  // ... apenas campos esperados, sem company_id
})

// 2. CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') ?? 'https://app.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 3. Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  // 4. Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // 5. Cliente Supabase com JWT do usuário (RLS aplica)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // 6. Confirma usuário
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // 7. Parse body com limite
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > 100_000) {
      return jsonResponse({ error: 'Payload too large' }, 413)
    }
    body = JSON.parse(text)
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  // 8. Validação
  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: 'Invalid input', issues: parsed.error.format() }, 422)
  }

  // 9. Lógica — RLS já filtra por tenant, trigger force_company_id seta
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert(parsed.data)  // sem company_id no insert
      .select()
      .single()

    if (error) {
      console.error('DB error:', error)
      return jsonResponse({ error: 'Operation failed' }, 500)
    }

    return jsonResponse({ data }, 200)
  } catch (e) {
    console.error('Unexpected error:', e)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

## Anti-patterns críticos

### ❌ Service role aceitando body
```ts
const { company_id, payload } = await req.json()
const sb = createClient(URL, SERVICE_ROLE_KEY)  // 🚨 ignora RLS
await sb.from('invoices').insert({ company_id, ...payload })
// → cliente passa company_id de outro tenant, ladrão.
```

### ❌ Stack trace na resposta
```ts
catch (e) {
  return new Response(JSON.stringify({ error: e.stack }), { status: 500 })
  // 🚨 vaza estrutura interna, paths, nomes de tabela
}
```

### ❌ CORS `*` com credentials
```ts
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Credentials': 'true',  // 🚨 incompatível, alguns browsers bloqueiam, outros permitem ataques
```

### ❌ Webhook sem verificar assinatura
```ts
// Stripe webhook
const event = JSON.parse(await req.text())
// 🚨 atacante envia payload falso e cria invoice paga
```

Correto:
```ts
import Stripe from 'npm:stripe'
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const sig = req.headers.get('stripe-signature')!
const event = stripe.webhooks.constructEvent(
  await req.text(),
  sig,
  Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
)
```

### ❌ Sem rate limit em endpoint custoso
Se a função chama LLM/IA por exemplo, sem rate limit um único usuário pode queimar seu budget. Use rate limit baseado em `user.id`:

```ts
// Em tabela rate_limits
const { data: recent } = await supabase
  .from('rate_limits')
  .select('count')
  .eq('user_id', user.id)
  .eq('endpoint', '<nome>')
  .gte('window_start', new Date(Date.now() - 60_000).toISOString())
  .single()

if ((recent?.count ?? 0) > 30) {
  return jsonResponse({ error: 'Rate limit exceeded' }, 429)
}
```

## Saída do guard

```
🛡️ EDGE FUNCTION GUARD — <nome da função>

✅ Aprovado: <N>/16 itens
🚨 Bloqueantes: <lista>
🟡 Atenção: <lista>

🔧 Patches sugeridos:
  <diff por bloqueante>

🎯 Veredito: <APROVADO PARA DEPLOY | BLOQUEADO>
```
