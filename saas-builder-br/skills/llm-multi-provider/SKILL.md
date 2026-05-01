---
name: llm-multi-provider
description: Padrão de roteador multi-provider para LLMs (OpenAI, Anthropic, Gemini) — fallback automático, retry exponencial, streaming SSE, tracking de custo por tenant, escolha por modelo/qualidade/preço, cache de respostas determinísticas. Use ao construir features que chamam LLM (chat, sumarização, análise, classificação).
---

# LLM Router multi-provider — padrão para SaaS

## Princípios

1. **Frontend nunca chama LLM direto.** Sempre via Edge Function.
2. **Toda chamada loga uso (`api_usage`)** com custo estimado.
3. **Fallback entre providers** quando o feature não exige modelo específico.
4. **Retry exponencial** apenas em 5xx e 429.
5. **Cache** quando temperatura = 0 e prompt é determinístico.
6. **Limite por tenant** (rate limit + budget mensal).

## Modelos atuais (atualize quando lançarem novos)

```ts
// supabase/functions/_shared/llm-models.ts
export const MODELS = {
  // OpenAI
  "gpt-4o":            { provider: "openai",    in: 0.0025,   out: 0.01,   ctx: 128_000, streaming: true },
  "gpt-4o-mini":       { provider: "openai",    in: 0.00015,  out: 0.0006, ctx: 128_000, streaming: true },
  "o3-mini":           { provider: "openai",    in: 0.0011,   out: 0.0044, ctx: 200_000, streaming: true, reasoning: true },

  // Anthropic
  "claude-opus-4-6":   { provider: "anthropic", in: 0.015,    out: 0.075,  ctx: 200_000, streaming: true },
  "claude-sonnet-4-6": { provider: "anthropic", in: 0.003,    out: 0.015,  ctx: 200_000, streaming: true },
  "claude-haiku-4-5":  { provider: "anthropic", in: 0.0008,   out: 0.004,  ctx: 200_000, streaming: true },

  // Google
  "gemini-2.0-flash":  { provider: "google",    in: 0.000075, out: 0.0003, ctx: 1_000_000, streaming: true },
  "gemini-2.0-pro":    { provider: "google",    in: 0.00125,  out: 0.005,  ctx: 2_000_000, streaming: true },
} as const;

export type ModelId = keyof typeof MODELS;
```

**Nota**: preços em USD por 1k tokens. Verifique mensalmente — providers mudam.

## Tier de qualidade (para fallback inteligente)

```ts
// Tarefa → ordem de fallback (1º é preferido)
export const FALLBACK_CHAINS = {
  cheap_fast: ["gemini-2.0-flash", "gpt-4o-mini", "claude-haiku-4-5"] as const,
  balanced:   ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.0-flash"] as const,
  smart:      ["claude-sonnet-4-6", "gpt-4o", "gemini-2.0-pro"] as const,
  reasoning:  ["o3-mini", "claude-opus-4-6"] as const,
};
```

## Edge Function — `llm/index.ts`

```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { authenticate } from "../_shared/auth.ts";
import { adminClient } from "../_shared/admin.ts";
import { MODELS, FALLBACK_CHAINS, type ModelId } from "../_shared/llm-models.ts";

interface LlmRequest {
  prompt: string;
  system?: string;
  model?: ModelId;
  tier?: keyof typeof FALLBACK_CHAINS;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  cache_key?: string; // se setado e temperature=0, usa cache
}

serve(async (req) => {
  if (req.method === "OPTIONS") return cors(req);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const ctx = await authenticate(req);
    const body: LlmRequest = await req.json();

    // Rate limit por tenant
    if (await rateLimited(ctx.company_id)) {
      return json({ error: "rate_limited" }, 429);
    }

    // Budget check
    if (await overBudget(ctx.company_id)) {
      return json({ error: "budget_exceeded", contact: "billing@..." }, 402);
    }

    // Cache hit
    if (body.cache_key && (body.temperature ?? 0) === 0) {
      const cached = await getCache(ctx.company_id, body.cache_key);
      if (cached) return json({ ...cached, cached: true }, 200);
    }

    // Resolve modelos a tentar
    const chain: ModelId[] = body.model
      ? [body.model]
      : [...FALLBACK_CHAINS[body.tier ?? "balanced"]];

    const result = await tryChain(chain, body, ctx);

    // Cache se aplicável
    if (body.cache_key && (body.temperature ?? 0) === 0) {
      await putCache(ctx.company_id, body.cache_key, result);
    }

    return json(result, 200);
  } catch (e) {
    console.error("[llm]", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

async function tryChain(chain: ModelId[], body: LlmRequest, ctx: AuthCtx) {
  let lastErr: unknown;
  for (const modelId of chain) {
    const start = Date.now();
    try {
      const result = await callWithRetry(modelId, body);
      await logUsage(ctx, modelId, result.usage, "success", Date.now() - start);
      return { ...result, model_used: modelId };
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] ${modelId} failed, tentando próximo:`, e);
      await logUsage(ctx, modelId, { input: 0, output: 0 }, "error", Date.now() - start, String(e));
    }
  }
  throw lastErr;
}

async function callWithRetry(modelId: ModelId, body: LlmRequest, max = 3) {
  let lastErr: unknown;
  for (let i = 0; i < max; i++) {
    try { return await callProvider(modelId, body); }
    catch (e: any) {
      lastErr = e;
      const status = e.status ?? 0;
      // Não retenta 4xx (exceto 429)
      if (status >= 400 && status < 500 && status !== 429) throw e;
      const delay = Math.min(1000 * 2 ** i, 8000) + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function callProvider(modelId: ModelId, body: LlmRequest) {
  const meta = MODELS[modelId];
  switch (meta.provider) {
    case "openai":    return callOpenAI(modelId, body);
    case "anthropic": return callAnthropic(modelId, body);
    case "google":    return callGemini(modelId, body);
  }
}
```

## Implementação por provider

### OpenAI (Chat Completions)
```ts
async function callOpenAI(model: string, req: LlmRequest) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(req.system ? [{ role: "system", content: req.system }] : []),
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.max_tokens,
      temperature: req.temperature ?? 0.7,
    }),
  });
  if (!r.ok) {
    const err: any = new Error("openai_error");
    err.status = r.status;
    err.body = await r.text();
    throw err;
  }
  const data = await r.json();
  return {
    text: data.choices[0].message.content,
    usage: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
  };
}
```

### Anthropic (Messages API)
```ts
async function callAnthropic(model: string, req: LlmRequest) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: req.max_tokens ?? 1024,
      ...(req.system && { system: req.system }),
      messages: [{ role: "user", content: req.prompt }],
      temperature: req.temperature ?? 0.7,
    }),
  });
  if (!r.ok) {
    const err: any = new Error("anthropic_error");
    err.status = r.status;
    err.body = await r.text();
    throw err;
  }
  const data = await r.json();
  return {
    text: data.content[0].text,
    usage: { input: data.usage.input_tokens, output: data.usage.output_tokens },
  };
}
```

### Google (Gemini)
```ts
async function callGemini(model: string, req: LlmRequest) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${Deno.env.get("GOOGLE_API_KEY")}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      ...(req.system && { systemInstruction: { parts: [{ text: req.system }] } }),
      generationConfig: {
        maxOutputTokens: req.max_tokens,
        temperature: req.temperature ?? 0.7,
      },
    }),
  });
  if (!r.ok) {
    const err: any = new Error("gemini_error");
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  return {
    text: data.candidates[0].content.parts[0].text,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? 0,
      output: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
```

## Streaming (SSE)

Use quando o usuário precisa ver tokens chegando (chat). No frontend:

```ts
// Cliente
async function streamLlm(prompt: string, onChunk: (text: string) => void) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/llm-stream`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session!.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, stream: true }),
  });
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const { delta } = JSON.parse(data);
          if (delta) onChunk(delta);
        } catch {}
      }
    }
  }
}
```

## Cache de respostas determinísticas

Tabela:
```sql
create table public.llm_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cache_key text not null,
  model text not null,
  response jsonb not null,
  hits int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (company_id, cache_key)
);
create index llm_cache_company_id_cache_key_idx on public.llm_cache(company_id, cache_key);
```

Use SHA256 do prompt+system+model como `cache_key` se não vier explícito.

## Rate limit + budget

Use `api_usage` (tabela definida no agent `integrador-apis`) para:

```ts
async function rateLimited(company_id: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("api_usage")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company_id)
    .in("provider", ["openai", "anthropic", "google"])
    .gte("created_at", since);
  return (count ?? 0) >= 60; // 60 req/min por tenant
}

async function overBudget(company_id: string): Promise<boolean> {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const { data } = await admin.from("api_usage")
    .select("cost_usd.sum()")
    .eq("company_id", company_id)
    .in("provider", ["openai", "anthropic", "google"])
    .gte("created_at", monthStart.toISOString())
    .single();
  const used = Number(data?.sum ?? 0);
  // Lê limite do plano da empresa (ajuste conforme seu modelo de billing)
  const { data: plan } = await admin.from("companies").select("monthly_llm_budget_usd").eq("id", company_id).single();
  return used >= (plan?.monthly_llm_budget_usd ?? 100);
}
```

## Anti-padrões

- ❌ `temperature: 0.7` em tarefa que devia ser determinística (extração estruturada)
- ❌ Esquecer `max_tokens` (modelo pode gerar 4000 tokens e custar 10x)
- ❌ Cache sem `company_id` na key (vaza resposta entre tenants — mesmo prompt, mas pode ter contexto diferente)
- ❌ Retry em 400/401/403 (não vai melhorar)
- ❌ Não logar uso em erro (perde dado de quanto está falhando)
- ❌ Streaming via `EventSource` no client (não envia Authorization header)
- ❌ Frontend escolhendo modelo ("o usuário pode trocar pro mais caro") — backend decide tier
