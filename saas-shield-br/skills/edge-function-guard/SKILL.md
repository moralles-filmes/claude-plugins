---
name: edge-function-guard
description: Audita Supabase Edge Functions (Deno) por falhas de segurança e robustez — validação do usuário (getUser/getClaims), empresa ativa confirmada por membership, permissão via can() sobre my_permissions, service role só depois do tenant resolvido, CORS, vazamento de erro, rate limit, idempotência e portabilidade (Deno.env só no entrypoint). Traz o template canônico de Edge Function dos plugins (arquétipo E do Padrão SaaS). Use quando o usuário pedir "revisa essa edge function", "isso aqui é seguro?" sobre código Deno, "audit edge function", ou ao analisar `supabase/functions/**/index.ts`.
---

# edge-function-guard

Você audita Supabase Edge Functions (Deno), o ponto cego onde a maioria dos vazamentos cross-tenant acontece em SaaS Supabase. Esta skill também é a **fonte única do template de Edge Function**: o saas-builder-br (`backend-supabase`, `llm-multi-provider`, `whatsapp-zapi-integracao`) referencia o template abaixo em vez de manter cópia.

## Convenção de tenant

Parametrizada pelo `.claude/tenancy-profile.yml` (skill `tenant-model`). `<TC>` é a coluna de tenant. O template segue o **arquétipo E** (Padrão SaaS v3.2): empresa ativa indicada pelo cliente (vinda da URL) e confirmada pela membership; permissões `<modulo>.<submodulo>.<acao>`. Projeto com `docs/standards/`: SECURITY, MULTI_TENANCY, ACCESS_CONTROL e GCP_MIGRATION do projeto prevalecem. Nos arquétipos A–D, troque só a resolução do contexto (passos 4–5) pelo resolver do profile; o resto vale igual.

## Quando ativa

- Arquivos em `supabase/functions/**/*.ts`
- Usuário pede "revisa essa edge function"
- Antes de `supabase functions deploy`
- Como parte de `/pre-deploy`

## Checklist (18 itens)

### Autenticação (3)

- [ ] O usuário é validado no Supabase Auth (`auth.getUser(token)` ou `auth.getClaims(token)`) antes de qualquer lógica? Decodificar o JWT na mão ou confiar em `getSession()` não valida nada.
- [ ] Sem `Authorization`, é webhook externo com **assinatura verificada** sobre o corpo cru?
- [ ] O cliente Supabase usa o JWT do próprio usuário (RLS aplica) por padrão?

### Tenant e autorização (4)

- [ ] O cliente só **indica** a empresa ativa (header `x-company-id`, tirado da URL). A função confirma a membership ativa antes de usar (`public.my_permissions(company_id)` vazio = sem acesso)?
- [ ] `<TC>` vindo no body é **ignorado ou sobrescrito** pelo valor confirmado (schema sem a coluna de tenant; insert com `company_id: ctx.companyId`)?
- [ ] A ação é autorizada com `can(ctx, '<modulo>.<sub>.<acao>', locationId)` sobre `my_permissions`, sem reimplementar a regra de concessão?
- [ ] `service_role` só aparece **depois** de tenant e permissão resolvidos, com justificativa (tabela sem grant ao usuário, webhook, job), e toda query com ela filtra `<TC>` explicitamente?

### Validação de input (3)

- [ ] Body lido com limite de tamanho e parse em try/catch?
- [ ] Schema em runtime (zod/valibot) com whitelist de campos (sem espalhar o body num insert)?
- [ ] Ids recebidos (filial, registro) conferidos contra o tenant e a permissão (IDOR)?

### CORS (2)

- [ ] `Access-Control-Allow-Origin` de uma lista exata de origens por ambiente (nunca `*` em endpoint autenticado)?
- [ ] Resposta ao `OPTIONS` (preflight), com `x-company-id` nos headers permitidos?

### Erros (2)

- [ ] Resposta ao cliente nunca leva `e.message`, stack, nome de tabela ou erro do Postgres: código estável + `requestId`?
- [ ] Log estruturado no servidor (`console.error` com `requestId`, sem segredo nem dado pessoal desnecessário)?

### Segredos e portabilidade (3)

- [ ] Segredos só via `Deno.env.get` — nada hardcoded, nada logado?
- [ ] `Deno.env` e o SDK do Supabase só no `index.ts` (entrypoint/adapter); regra de negócio em módulo sem `Deno.*` nem `@supabase/*` (GCP_MIGRATION §6, `scripts/check-portabilidade.mjs`)?
- [ ] Sem chamada a provedor externo com segredo fora do servidor?

### Idempotência (1)

- [ ] Mutação com efeito externo ou dinheiro aceita chave de idempotência (header `Idempotency-Key`) registrada na mesma transação (DATABASE §4)?

## Template canônico (arquétipo E)

Três arquivos. Só o `index.ts` conhece Deno e Supabase.

```ts
// supabase/functions/_shared/permissions.ts — função pura (ACCESS_CONTROL §4). Sem Deno, sem SDK.
// Se o projeto já tem can() no domínio (importado via import map), use o dele: não duplique.
export type Grant = { permission: string; location_id: string | null }
export type TenantContext = {
  userId: string
  companyId: string
  permissions: Grant[] // linhas de public.my_permissions(company_id): chaves já expandidas pelo banco
  requestId: string
}

/**
 * locationId string    → precisa valer naquela filial (concessão da empresa inteira também vale)
 * locationId null      → precisa de concessão da empresa inteira (cadastro compartilhado)
 * locationId undefined → qualquer concessão na empresa
 */
export function can(ctx: TenantContext, perm: string, locationId?: string | null): boolean {
  return ctx.permissions.some((g) =>
    g.permission === perm &&
    (locationId === undefined || g.location_id === null || g.location_id === locationId))
}
```

```ts
// supabase/functions/criar-conta/caso-de-uso.ts — regra de negócio. Sem Deno, sem SDK: testável com porta falsa.
import { can, type TenantContext } from '../_shared/permissions.ts'

export type NovaConta = { location_id: string; supplier_id: string; amount_cents: number; due_date: string }
export interface ContasPort {
  inserir(companyId: string, conta: NovaConta): Promise<{ id: string }>
}
export class Proibido extends Error {}

export async function criarConta(ctx: TenantContext, conta: NovaConta, contas: ContasPort) {
  if (!can(ctx, 'financeiro.contas_pagar.criar', conta.location_id)) throw new Proibido()
  return contas.inserir(ctx.companyId, conta) // a empresa vem do contexto confirmado, nunca do body
}
```

```ts
// supabase/functions/criar-conta/index.ts — entrypoint e adapter: único arquivo com Deno.* e @supabase/*
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import type { Grant, TenantContext } from '../_shared/permissions.ts'
import { criarConta, Proibido, type ContasPort } from './caso-de-uso.ts'

// Config lida uma vez, só aqui.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')! // ou a publishable key (sb_publishable_…)
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean)
const MAX_BODY = 100_000

// z.object descarta chaves desconhecidas: company_id enviado no body some aqui.
const Input = z.object({
  location_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  due_date: z.string().date(),
})
const CompanyId = z.string().uuid()

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
  const cors = corsHeaders(req)
  const reply = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)

  try {
    // 1. Usuário: o token é validado no Supabase Auth (getClaims(token) também serve).
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return reply({ error: 'unauthorized', requestId }, 401)
    const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }, // RLS aplica com o JWT do usuário
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user) return reply({ error: 'unauthorized', requestId }, 401)

    // 2. Empresa ativa: o cliente INDICA (header tirado da URL); a membership confirma no passo 3.
    const company = CompanyId.safeParse(req.headers.get('x-company-id'))
    if (!company.success) return reply({ error: 'company_required', requestId }, 400)

    // 3. Permissões efetivas: membership ativa, status da empresa, módulo contratado e filial,
    //    tudo resolvido pelo banco. Lista vazia = sem acesso (não revela se a empresa existe).
    const { data: permissions, error: permError } = await db.rpc('my_permissions', { p_company_id: company.data })
    if (permError) throw permError
    if (!permissions?.length) return reply({ error: 'forbidden', requestId }, 403)
    const ctx: TenantContext = { userId: user.id, companyId: company.data, permissions: permissions as Grant[], requestId }

    // 4. Input com limite de tamanho e whitelist de campos.
    const text = await req.text()
    if (text.length > MAX_BODY) return reply({ error: 'payload_too_large', requestId }, 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return reply({ error: 'invalid_json', requestId }, 400) }
    const input = Input.safeParse(body)
    if (!input.success) return reply({ error: 'invalid_input', requestId, fields: input.error.flatten().fieldErrors }, 422)

    // 5. Caso de uso com a porta implementada sobre o client do usuário (RLS + with check confirmam de novo).
    const contas: ContasPort = {
      async inserir(companyId, conta) {
        const { data, error } = await db.from('bills').insert({ ...conta, company_id: companyId }).select('id').single()
        if (error) throw error
        return data
      },
    }
    const created = await criarConta(ctx, input.data, contas)
    return reply({ data: created, requestId }, 201)
  } catch (e) {
    if (e instanceof Proibido) return reply({ error: 'forbidden', requestId }, 403)
    // Detalhe só no log. O cliente recebe código estável + requestId, nunca e.message.
    console.error(JSON.stringify({ level: 'error', requestId, fn: 'criar-conta', error: String(e) }))
    return reply({ error: 'internal_error', requestId }, 500)
  }
})

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    ...(ALLOWED_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-company-id, idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
```

No cliente, o adapter do módulo envia a empresa da URL: `supabase.functions.invoke('criar-conta', { body, headers: { 'x-company-id': companyId } })`.

### Quando precisar de service role

Só depois dos passos 1–3 (usuário, empresa confirmada, permissão), e só para o que o usuário não pode fazer com o próprio JWT. Toda query filtra a coluna de tenant explicitamente, porque a RLS não protege:

```ts
// dentro do index.ts (adapter), depois de can(ctx, …) ter passado
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
await admin.from('bills').update({ status: 'paid' })
  .eq('id', billId)
  .eq('company_id', ctx.companyId) // obrigatório: tenant do contexto confirmado, nunca do body
```

Prefira uma RPC que encapsula a operação (modelo B de DATABASE §4) a dar service role à função.

## Anti-patterns críticos

### ❌ Service role com o tenant do cliente
```ts
const { company_id, payload } = await req.json()   // tenant indicado, nunca confirmado
const sb = createClient(URL, SERVICE_ROLE_KEY)       // 🚨 ignora RLS
await sb.from('invoices').insert({ company_id, ...payload })
// → o cliente troca o company_id e grava em outro tenant.
```

### ❌ Empresa ativa de claim do JWT
```ts
const companyId = user.app_metadata.company_id   // 🚨 fica velha até o refresh; quebra 2 abas em empresas diferentes
```
Em projeto `active_source: url`, a empresa vem do header indicado pelo cliente e é confirmada pela membership.

### ❌ Erro cru na resposta
```ts
catch (e) {
  return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500 })
  // 🚨 vaza estrutura interna, nome de tabela, constraint, às vezes dado de outro tenant
}
```

### ❌ CORS `*` com credenciais
```ts
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Credentials': 'true',  // 🚨 combinação inválida; use a lista exata de origens
```

### ❌ Webhook sem verificar assinatura
```ts
const event = JSON.parse(await req.text())
// 🚨 atacante envia payload falso e cria fatura paga
```

Correto (Stripe no Deno usa a verificação assíncrona com SubtleCrypto):
```ts
import Stripe from 'npm:stripe@17'
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const event = await stripe.webhooks.constructEventAsync(
  await req.text(),                       // corpo CRU, antes de qualquer JSON.parse
  req.headers.get('stripe-signature') ?? '',
  Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
  undefined,
  cryptoProvider,
)
// Tenant: da conexão vinculada à conta externa (ex.: stripe_customer_id → company_id), nunca do payload.
```

### ❌ Sem rate limit em endpoint custoso
Função que chama LLM, envia mensagem ou gera arquivo precisa de limite por usuário **e** por empresa. Faça o incremento e a checagem numa só instrução (RPC com `insert … on conflict … do update … returning count`), não "lê, compara, grava": duas requisições simultâneas passam pela leitura.

```ts
const { data: allowed } = await db.rpc('consume_rate_limit', {
  p_company_id: ctx.companyId, p_bucket: 'ia.resumo', p_limit: 30, p_window_seconds: 60,
})
if (!allowed) return reply({ error: 'rate_limited', requestId }, 429)
```

## Saída do guard

```
🛡️ EDGE FUNCTION GUARD — <nome da função>  | Arquétipo: <A–E>

✅ Aprovado: <N>/18 itens
🚨 Bloqueantes: <lista>
🟡 Atenção: <lista>

🔧 Patches sugeridos:
  <diff por bloqueante>

🎯 Veredito: <APROVADO PARA DEPLOY | BLOQUEADO>
```
