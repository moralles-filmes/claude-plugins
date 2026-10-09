---
name: whatsapp-zapi-integracao
description: Playbook completo de integração WhatsApp via Z-API e/ou Cloud API Meta para SaaS multi-tenant. Quando usar cada um, esquema das tabelas (wa_configs com tokens no Supabase Vault, wa_threads, wa_messages, inbox de webhooks), Edge Functions canônicas (envio, webhook, status), idempotência por client_msg_id, verificação HMAC do Meta, sessão de 24h, templates aprovados, dedup. Use ao construir feature que envia/recebe WhatsApp.
---

# WhatsApp para SaaS multi-tenant — Z-API + Cloud API

> Norma: `docs/standards/INTEGRATIONS.md` (§3 conexão, §5 credenciais, §8 idempotência, §12 webhooks) e `docs/integrations/providers/{zapi,meta}.md`. Exemplos no arquétipo E (`company_id`). As Edge Functions seguem o template do `saas-shield-br:edge-function-guard`; `requireTenant`/`can`/`adminClient`/`json` são os helpers de `_shared/` descritos no `backend-supabase`, `fetchWithTimeout`/`HttpError` vêm do `integrador-apis`. Em produção, a regra sai do `index.ts` para `_shared/application/whatsapp/`.

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
-- Conexão WhatsApp de cada empresa (registro de conexão, INTEGRATIONS §3).
-- NENHUM segredo aqui: tokens ficam no Supabase Vault e a tabela guarda só o id do segredo.
create table public.wa_configs (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies (id),
  provider               text not null check (provider in ('zapi', 'meta_cloud')),
  external_account_id    text not null,  -- Z-API: id da instância · Meta: phone_number_id
  token_secret_id        uuid not null,  -- vault: token da instância Z-API ou access token da Meta
  client_token_secret_id uuid,           -- vault: Client-Token da conta Z-API, quando habilitado
  webhook_secret_id      uuid,           -- vault: segredo aleatório do path do webhook Z-API
  display_name           text,
  status                 text not null default 'active' check (status in ('active', 'paused', 'revoked', 'error')),
  created_at             timestamptz not null default now(),
  unique (provider, external_account_id),  -- é o que mapeia webhook → company_id
  unique (company_id, id)
);

-- Leitura do segredo: só o servidor. Em `public` de propósito (o service role chama via RPC);
-- execute revogado de todos os outros papéis.
create or replace function public.wa_connection_secrets(p_connection_id uuid)
returns table (token text, client_token text, webhook_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.decrypted_secret, ct.decrypted_secret, ws.decrypted_secret
    from public.wa_configs w
    join vault.decrypted_secrets t       on t.id  = w.token_secret_id
    left join vault.decrypted_secrets ct on ct.id = w.client_token_secret_id
    left join vault.decrypted_secrets ws on ws.id = w.webhook_secret_id
   where w.id = p_connection_id
$$;
revoke all on function public.wa_connection_secrets(uuid) from public, anon, authenticated;
grant execute on function public.wa_connection_secrets(uuid) to service_role;

create table public.wa_threads (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id),
  contact_phone   text not null, -- E.164 sem +: 5511999999999
  contact_name    text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,   -- janela de 24h (Cloud API)
  unread_count    int not null default 0,
  status          text not null default 'open' check (status in ('open', 'archived', 'spam')),
  created_at      timestamptz not null default now(),
  unique (company_id, contact_phone),
  unique (company_id, id)
);
create index wa_threads_company_last_message_idx on public.wa_threads (company_id, last_message_at desc);

create table public.wa_messages (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  thread_id       uuid not null,
  client_msg_id   text,          -- idempotência do envio
  provider_msg_id text,          -- id devolvido pela Z-API/Meta
  direction       text not null check (direction in ('in', 'out')),
  body            text,
  media_url       text,
  media_type      text,
  status          text not null default 'pending'
                  check (status in ('pending', 'unknown', 'sent', 'delivered', 'read', 'failed')),
  error_code      text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (company_id, thread_id) references public.wa_threads (company_id, id) on delete cascade,
  unique (company_id, client_msg_id)
);
create index wa_messages_thread_created_idx on public.wa_messages (thread_id, created_at desc);
create index wa_messages_company_provider_msg_idx on public.wa_messages (company_id, provider_msg_id);

-- Inbox de webhooks: dedup durável + processamento recuperável (INTEGRATIONS §12)
create table public.wa_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id),  -- resolvido pela conexão
  provider          text not null,
  provider_event_id text not null,
  payload           jsonb not null,
  status            text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  error             text,
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);
```

RLS forçada e policies pela skill `saas-shield-br:supabase-migrator` (ex.: `allowed_company_ids('whatsapp.conversas.ver')`). `wa_configs` sem insert/update/delete para `authenticated`: conectar e rotacionar é a Edge Function `wa-conectar` (`can(ctx, 'whatsapp.conexoes.editar')`), que com service role grava o token com `vault.create_secret(...)`/`vault.update_secret(...)` e salva só o id. A leitura da conexão nunca devolve segredo.

## Fluxo de envio (Z-API)

`supabase/functions/wa-send-zapi/index.ts` — o frontend chama pelo `api.ts` com o header `x-company-id`:

```ts
import { z } from "zod";

const SendInput = z.object({
  to: z.string().regex(/^\d{10,15}$/),
  message: z.string().min(1).max(4096),
  client_msg_id: z.string().uuid(), // gerado uma vez por intenção no frontend
});

Deno.serve(async (req) => {
  const ctx = await requireTenant(req);                    // JWT + x-company-id + membership ativa
  if (!can(ctx, "whatsapp.mensagens.enviar")) return json({ error: "forbidden" }, 403);
  const input = SendInput.safeParse(await req.json());
  if (!input.success) return json({ error: "invalid_input" }, 400);
  const { to, message, client_msg_id } = input.data;
  const admin = adminClient();                             // service role: filtre company_id em TODA query

  // 1. Conexão da empresa resolvida (nunca do body) e segredos do Vault
  const { data: conn } = await admin.from("wa_configs").select("id, external_account_id")
    .eq("company_id", ctx.companyId).eq("provider", "zapi").eq("status", "active").maybeSingle();
  if (!conn) return json({ error: "wa_not_configured" }, 409);
  const { data: sec, error: secErr } = await admin.rpc("wa_connection_secrets", { p_connection_id: conn.id }).single();
  if (secErr || !sec) return json({ error: "wa_not_configured" }, 409);

  // 2. Reserva a mensagem ANTES de enviar: unique (company_id, client_msg_id) barra a repetição
  const { data: thread, error: thErr } = await admin.from("wa_threads")
    .upsert({ company_id: ctx.companyId, contact_phone: to, last_message_at: new Date().toISOString() },
            { onConflict: "company_id,contact_phone" })
    .select("id").single();
  if (thErr) throw thErr;
  const { data: msg, error: msgErr } = await admin.from("wa_messages")
    .insert({ company_id: ctx.companyId, thread_id: thread.id, client_msg_id, direction: "out", body: message })
    .select("id").single();
  if (msgErr?.code === "23505") return json({ deduped: true }, 200);
  if (msgErr) throw msgErr;

  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    admin.from("wa_messages").update({ status, ...extra }).eq("company_id", ctx.companyId).eq("id", msg.id);
  const usage = (status: "success" | "error" | "timeout", sent: number, error_code: string | null = null) =>
    admin.from("api_usage").insert({ company_id: ctx.companyId, user_id: ctx.userId, provider: "zapi", status, messages_sent: sent, error_code });

  // 3. UMA tentativa: a Z-API não deduplica. O token está no PATH: a URL nunca vai para log ou erro.
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.z-api.io/instances/${conn.external_account_id}/token/${sec.token}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sec.client_token ? { "Client-Token": sec.client_token } : {}) },
        body: JSON.stringify({ phone: to, message }),
      },
    );
  } catch (e) {
    // 429 = não enviou. Timeout ou 5xx = pode ter enviado: UNKNOWN, reconciliado pelo webhook de status.
    const notSent = e instanceof HttpError && e.status === 429;
    await setStatus(notSent ? "failed" : "unknown");
    await usage(e instanceof HttpError ? "error" : "timeout", 0, e instanceof HttpError ? String(e.status) : "timeout");
    return json({ id: msg.id, status: notSent ? "failed" : "unknown" }, notSent ? 429 : 202);
  }

  if (!res.ok) {                                            // 4xx: não enviou; o corpo do provedor não vai ao cliente
    await setStatus("failed", { error_code: String(res.status) });
    await usage("error", 0, String(res.status));
    return json({ error: "zapi_error" }, 502);
  }

  const data: { messageId?: string; id?: string } = await res.json();
  await setStatus("sent", { provider_msg_id: data.messageId ?? data.id ?? null, sent_at: new Date().toISOString() });
  await usage("success", 1);                                // Z-API cobra mensalidade, não por mensagem
  return json({ id: msg.id, status: "sent" }, 200);
});
```

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
async function pickMessageType(admin: SupabaseClient, companyId: string, threadId: string, body: string) {
  const { data: thread } = await admin.from("wa_threads").select("last_inbound_at")
    .eq("company_id", companyId).eq("id", threadId).single();
  const within24h = !!thread?.last_inbound_at &&
    Date.now() - new Date(thread.last_inbound_at).getTime() < 24 * 3600 * 1000;
  return within24h
    ? { type: "text" as const, text: { body } }
    : { type: "template" as const, template: { name: "reabrir_conversa", language: { code: "pt_BR" } } };
}
```

## Webhook recebendo (Z-API)

Confirme no provider doc se a Z-API assina webhooks. Se não assinar, use o fallback de INTEGRATIONS §12: **segredo aleatório (≥128 bits) por conexão no path**, comparado em tempo constante e rotacionável. URL cadastrada no painel da instância: `.../functions/v1/wa-webhook-zapi/<connection_id>/<segredo>`.

```ts
const MAX_BYTES = 1_000_000;
const ZapiEvent = z.object({
  type: z.string(),
  instanceId: z.string(),
  messageId: z.string(),
}).passthrough();

Deno.serve(async (req) => {
  const [connectionId = "", secret = ""] = new URL(req.url).pathname.split("/").slice(-2);
  if (!z.string().uuid().safeParse(connectionId).success) return new Response(null, { status: 401 });
  const admin = adminClient();

  // Conta externa → conexão → company_id. Nada do payload decide o tenant.
  const { data: conn } = await admin.from("wa_configs").select("id, company_id, external_account_id")
    .eq("id", connectionId).eq("provider", "zapi").eq("status", "active").maybeSingle();
  if (!conn) return new Response(null, { status: 401 });
  const { data: sec } = await admin.rpc("wa_connection_secrets", { p_connection_id: conn.id }).single();
  if (!sec?.webhook_secret || !constantTimeEqual(secret, sec.webhook_secret)) return new Response(null, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const parsed = ZapiEvent.safeParse(body);
  if (!parsed.success || parsed.data.instanceId !== conn.external_account_id) return new Response(null, { status: 400 });
  const event = parsed.data;

  // Gravação durável ANTES do 2xx: unique (provider, provider_event_id) é a deduplicação.
  const { error } = await admin.from("wa_webhook_events").insert({
    company_id: conn.company_id,
    provider: "zapi",
    provider_event_id: `${event.type}:${event.messageId}`,
    payload: event,
  });
  if (error && error.code !== "23505") return new Response(null, { status: 500 }); // não gravou: deixe reenviar
  return new Response(null, { status: 200 });                                      // novo ou duplicata
});
```

O processamento roda no worker (pg_cron → Edge Function `wa-inbox-worker`), que pega eventos `received` com `for update skip locked` (via RPC), marca `processing` e, para `ReceivedCallback`:

```ts
const ZapiReceived = z.object({
  phone: z.string(),
  messageId: z.string(),
  senderName: z.string().optional(),
  text: z.object({ message: z.string() }).optional(),
  image: z.object({ imageUrl: z.string().url() }).optional(),
  audio: z.object({ audioUrl: z.string().url() }).optional(),
});
type ZapiReceived = z.infer<typeof ZapiReceived>;

async function processReceived(admin: SupabaseClient, companyId: string, payload: ZapiReceived) {
  const now = new Date().toISOString();
  const { data: thread, error } = await admin.from("wa_threads")
    .upsert({ company_id: companyId, contact_phone: payload.phone, contact_name: payload.senderName ?? null,
              last_message_at: now, last_inbound_at: now }, { onConflict: "company_id,contact_phone" })
    .select("id").single();
  if (error) throw error;
  const { error: msgErr } = await admin.from("wa_messages").insert({
    company_id: companyId, thread_id: thread.id, provider_msg_id: payload.messageId, direction: "in",
    body: payload.text?.message ?? null,
    media_url: payload.image?.imageUrl ?? payload.audio?.audioUrl ?? null,
    media_type: payload.image ? "image" : payload.audio ? "audio" : null,
    status: "delivered",
  });
  if (msgErr) throw msgErr;
  const { error: unreadErr } = await admin.rpc("increment_unread", { p_company_id: companyId, p_thread_id: thread.id });
  if (unreadErr) throw unreadErr;
}
```

O worker valida o payload com `ZapiReceived.parse(...)` antes de chamar. As alterações e a marcação `processed` ficam na mesma transação quando possível (RPC); evento preso em `processing` além do lease volta para a fila.

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

// _shared/crypto.ts — também usado no webhook da Z-API
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

Resolução de tenant: `metadata.phone_number_id` → `wa_configs` (`provider = 'meta_cloud'`, `external_account_id`) → `company_id`, **depois** de validar o HMAC. O access token da Meta de cada empresa vem de `wa_connection_secrets`. O `META_APP_SECRET` é da plataforma (Supabase secret).

## Status callbacks (sent → delivered → read)

Tanto Z-API quanto Meta enviam atualizações de status via webhook (Z-API: `MessageStatusCallback`; Meta: `entry[].changes[].value.statuses[]`). No worker, atualize por `company_id` da conexão + `provider_msg_id`, **sem regredir** (evento atrasado não volta `read` para `sent`):

```ts
const ORDER = ["pending", "unknown", "sent", "delivered", "read"] as const;
type Delivery = (typeof ORDER)[number];

async function applyStatus(admin: SupabaseClient, companyId: string, providerMsgId: string, next: Delivery) {
  const now = new Date().toISOString();
  const { error } = await admin.from("wa_messages")
    .update({
      status: next,
      ...(next === "delivered" ? { delivered_at: now } : {}),
      ...(next === "read" ? { read_at: now } : {}),
    })
    .eq("company_id", companyId)
    .eq("provider_msg_id", providerMsgId)
    .in("status", ORDER.slice(0, ORDER.indexOf(next))); // só avança
  if (error) throw error;
}
```

`unknown` que recebe status confirma o envio; `unknown` sem status depois do prazo é reconciliado antes de qualquer reenvio.

## Anti-padrões

- ❌ Webhook sem dedup — vai gravar mensagem duplicada toda vez que provider retentar
- ❌ Webhook que retorna 4xx/5xx em erro de aplicação (provider retenta infinitamente)
- ❌ Resposta síncrona pesada no webhook (timeout do provider) — enfileire job se demorar
- ❌ Hardcode de número de telefone em código (use `wa_configs`)
- ❌ Token Z-API ou Meta em coluna da tabela, em env compartilhado entre clientes ou no frontend — Vault, com referência na conexão
- ❌ Logar a URL da Z-API (o token está no path) ou devolver o corpo do provedor ao cliente
- ❌ Tenant do webhook lido do payload ou query com service role sem `company_id`
- ❌ Esquecer `client_msg_id` no envio (perde idempotência)
- ❌ Não validar HMAC do Meta (qualquer um pode injetar mensagens)
- ❌ Cloud API: enviar texto livre fora da janela 24h sem template (Meta bloqueia)

## Checklist de produção

- [ ] HMAC do Meta validado em todo POST, sobre o corpo bruto
- [ ] Segredo por conexão no path do webhook Z-API, comparado em tempo constante
- [ ] Inbox durável (`unique (provider, provider_event_id)`) antes do 2xx; processamento no worker
- [ ] Resposta 2xx em < 2s depois de gravar
- [ ] Tokens no Vault; `wa_configs` só com `*_secret_id`; `wa_connection_secrets` executável só pelo `service_role`
- [ ] Rate limiter por tenant antes de enviar
- [ ] Audit log de toda mensagem enviada (não só `wa_messages` — também `audit_logs` se tiver)
- [ ] Política de retenção (LGPD): wa_messages com TTL configurável por tenant
