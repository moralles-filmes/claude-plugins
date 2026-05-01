---
name: whatsapp-zapi-integracao
description: Playbook completo de integração WhatsApp via Z-API e/ou Cloud API Meta para SaaS multi-tenant. Quando usar cada um, esquema das tabelas (wa_messages, wa_configs, wa_threads), Edge Functions canônicas (envio, webhook, status), idempotência por client_msg_id, verificação HMAC do Meta, sessão de 24h, templates aprovados, dedup. Use ao construir feature que envia/recebe WhatsApp.
---

# WhatsApp para SaaS multi-tenant — Z-API + Cloud API

## Decisão: Z-API ou Cloud API Meta?

| Critério | Z-API | Cloud API (Meta) |
|---|---|---|
| **Setup** | Compra instância (~R$ 100/mês) | Aprovação no Business Manager |
| **Custo por mensagem** | Mensalidade fixa | Por conversa iniciada (4 categorias) |
| **Estabilidade** | Pode cair se WhatsApp atualizar protocolo | Estável, oficial |
| **Templates** | Não precisa | Obrigatório fora da janela 24h |
| **Janela 24h** | Não tem | Sim |
| **Multi-instância** | Cada cliente compra a dele | 1 número de business → 1 phone_number_id |
| **Conformidade** | "Cinza" — pode ter ban | Oficial, sem risco de ban |
| **Use quando** | MVP rápido, mensagens transacionais simples | Produção séria, escala, compliance |

**Recomendação para SaaS multi-tenant**: comece com Z-API por tenant (cada empresa traz sua instância), e ofereça migração para Cloud API quando o cliente crescer.

## Schema canônico (peça pro `db-schema-designer`)

```sql
-- Configuração WhatsApp por empresa (cada uma tem sua instância Z-API ou seu number_id Meta)
create table public.wa_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('zapi', 'meta_cloud')),
  -- Z-API
  zapi_instance_id text,
  zapi_token text,
  zapi_client_token text,
  -- Cloud API Meta
  meta_phone_number_id text,
  meta_business_account_id text,
  meta_access_token text, -- criptografar em prod (pgsodium ou external KMS)
  -- Comum
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id) -- 1 config por empresa por enquanto
);
-- (RLS no padrão MarginPro — só admins do tenant podem ver tokens)

-- Threads (conversas)
create table public.wa_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_phone text not null, -- E.164 sem +: 5511999999999
  contact_name text,
  last_message_at timestamptz,
  last_inbound_at timestamptz, -- usado pra calcular janela 24h (Cloud API)
  unread_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'archived', 'spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contact_phone)
);
create index wa_threads_company_id_last_message_at_idx
  on public.wa_threads(company_id, last_message_at desc);

-- Mensagens
create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  thread_id uuid not null references public.wa_threads(id) on delete cascade,
  client_msg_id text, -- idempotência em envio
  provider_msg_id text, -- ID retornado pelo Z-API/Meta
  direction text not null check (direction in ('in', 'out')),
  body text,
  media_url text,
  media_type text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  payload jsonb, -- payload bruto do provider (pra debug)
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, client_msg_id)  -- dedupe envio
);
create index wa_messages_thread_id_created_at_idx
  on public.wa_messages(thread_id, created_at desc);
create index wa_messages_provider_msg_id_idx
  on public.wa_messages(provider_msg_id);

-- Webhook events (dedupe + audit)
create table public.wa_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
```

## Fluxo de envio (Z-API)

`supabase/functions/wa-send/index.ts` (já visto no agent `integrador-apis` — referencie lá para o esqueleto auth+retry).

Pontos específicos do Z-API:

1. **Endpoint**: `POST https://api.z-api.io/instances/{INSTANCE}/token/{TOKEN}/send-text`
2. **Header obrigatório**: `Client-Token: <CLIENT_TOKEN>` (criar em painel)
3. **Body**: `{ "phone": "5511999999999", "message": "Olá" }`
4. **Resposta**: `{ "messageId": "ABCD123", "id": "xxx" }`
5. **Rate limit**: ~80 msg/min por instância (não documentado oficialmente — implemente token bucket)

## Fluxo de envio (Cloud API Meta)

1. **Endpoint**: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`
2. **Auth**: `Authorization: Bearer {ACCESS_TOKEN}` (token do Business Manager)
3. **Body** (texto livre, dentro da janela 24h):
   ```json
   {
     "messaging_product": "whatsapp",
     "to": "5511999999999",
     "type": "text",
     "text": { "body": "Olá" }
   }
   ```
4. **Body** (template aprovado, fora da janela):
   ```json
   {
     "messaging_product": "whatsapp",
     "to": "5511999999999",
     "type": "template",
     "template": {
       "name": "boas_vindas",
       "language": { "code": "pt_BR" },
       "components": [
         { "type": "body", "parameters": [{ "type": "text", "text": "Yuri" }] }
       ]
     }
   }
   ```

**Decisão automática template vs texto**:
```ts
async function pickMessageType(thread_id: string, body: string) {
  const { data: thread } = await admin.from("wa_threads").select("last_inbound_at").eq("id", thread_id).single();
  const within24h = thread?.last_inbound_at &&
    Date.now() - new Date(thread.last_inbound_at).getTime() < 24 * 3600 * 1000;
  return within24h
    ? { type: "text" as const, text: { body } }
    : { type: "template" as const, /* ... template padrão para reabertura */ };
}
```

## Webhook recebendo (Z-API)

Z-API envia POST sem assinatura por padrão. Configure um **token secreto** no painel (header `X-Webhook-Token`) e valide:

```ts
serve(async (req) => {
  const tokenHeader = req.headers.get("x-webhook-token");
  if (tokenHeader !== Deno.env.get("ZAPI_WEBHOOK_TOKEN")) {
    return new Response("invalid", { status: 401 });
  }

  const payload = await req.json();
  // Z-API tipos: "ReceivedCallback", "MessageStatusCallback", "PresenceChatCallback"
  if (payload.type !== "ReceivedCallback") return new Response("ok", { status: 200 });

  // Dedupe
  const event_id = payload.messageId;
  const admin = adminClient();
  const { data: dup } = await admin.from("wa_webhook_events")
    .select("id").eq("provider", "zapi").eq("provider_event_id", event_id).maybeSingle();
  if (dup) return new Response("duplicate", { status: 200 });

  // Resolve tenant pelo número da instância (vem em payload.instanceId)
  const { data: cfg } = await admin
    .from("wa_configs")
    .select("company_id")
    .eq("zapi_instance_id", payload.instanceId)
    .single();
  if (!cfg) {
    console.warn("[wh-zapi] instance sem tenant:", payload.instanceId);
    return new Response("ok", { status: 200 }); // 2xx pra não retentar
  }

  // Upsert thread
  const phone = payload.phone; // já vem sem +
  const { data: thread } = await admin
    .from("wa_threads")
    .upsert({
      company_id: cfg.company_id,
      contact_phone: phone,
      contact_name: payload.senderName,
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    }, { onConflict: "company_id,contact_phone" })
    .select("id, unread_count")
    .single();

  // Insert mensagem
  await admin.from("wa_messages").insert({
    company_id: cfg.company_id,
    thread_id: thread!.id,
    provider_msg_id: payload.messageId,
    direction: "in",
    body: payload.text?.message ?? null,
    media_url: payload.image?.imageUrl ?? payload.audio?.audioUrl ?? null,
    media_type: payload.image ? "image" : payload.audio ? "audio" : null,
    status: "delivered",
    payload,
  });

  // Incrementa unread
  await admin.rpc("increment_unread", { thread_id: thread!.id });

  // Registra evento processado
  await admin.from("wa_webhook_events").insert({
    provider: "zapi", provider_event_id: event_id, payload, processed_at: new Date().toISOString(),
  });

  return new Response("ok", { status: 200 });
});
```

## Webhook recebendo (Cloud API Meta)

**Verificação inicial (GET)**:
```ts
if (req.method === "GET") {
  const url = new URL(req.url);
  if (url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === Deno.env.get("META_VERIFY_TOKEN")) {
    return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}
```

**HMAC SHA256 (POST)** — header `X-Hub-Signature-256: sha256=<hex>`:
```ts
const signature = req.headers.get("x-hub-signature-256");
const raw = await req.text();
const expected = "sha256=" + await hmacHex(Deno.env.get("META_APP_SECRET")!, raw);
if (!constantTimeEqual(signature, expected)) {
  return new Response("invalid_signature", { status: 401 });
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
```

**Estrutura do payload Meta**:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "<PNI>" },
        "contacts": [{ "profile": { "name": "Yuri" }, "wa_id": "5511999999999" }],
        "messages": [{
          "from": "5511999999999",
          "id": "wamid.xxxxx",
          "timestamp": "1700000000",
          "type": "text",
          "text": { "body": "oi" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

Resolução de tenant: pelo `metadata.phone_number_id`.

## Status callbacks (sent → delivered → read)

Tanto Z-API quanto Meta enviam atualizações de status via webhook. Atualize `wa_messages.status` por `provider_msg_id`:

```ts
// Z-API: payload.type === "MessageStatusCallback"
// Meta: dentro de entry[].changes[].value.statuses[]

await admin.from("wa_messages")
  .update({
    status: novoStatus, // "sent" | "delivered" | "read" | "failed"
    delivered_at: novoStatus === "delivered" ? new Date().toISOString() : undefined,
    read_at: novoStatus === "read" ? new Date().toISOString() : undefined,
  })
  .eq("provider_msg_id", payload.messageId);
```

## Anti-padrões

- ❌ Webhook sem dedup — vai gravar mensagem duplicada toda vez que provider retentar
- ❌ Webhook que retorna 4xx/5xx em erro de aplicação (provider retenta infinitamente)
- ❌ Resposta síncrona pesada no webhook (timeout do provider) — enfileire job se demorar
- ❌ Hardcode de número de telefone em código (use `wa_configs`)
- ❌ Token Z-API ou Meta no frontend (sempre Edge Function)
- ❌ Esquecer `client_msg_id` no envio (perde idempotência)
- ❌ Não validar HMAC do Meta (qualquer um pode injetar mensagens)
- ❌ Cloud API: enviar texto livre fora da janela 24h sem template (Meta bloqueia)

## Checklist de produção

- [ ] HMAC do Meta validado em todo POST
- [ ] Token webhook do Z-API validado em todo POST
- [ ] Dedup por `provider_event_id` antes de processar
- [ ] Resposta 2xx em < 2s (mesmo em erro de aplicação)
- [ ] `wa_configs.meta_access_token` criptografado (pgsodium)
- [ ] Rate limiter por tenant antes de enviar
- [ ] Audit log de toda mensagem enviada (não só `wa_messages` — também `audit_logs` se tiver)
- [ ] Política de retenção (LGPD): wa_messages com TTL configurável por tenant
