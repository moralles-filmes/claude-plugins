---
name: tanstack-query-supabase
description: Padrões TanStack Query v5 + Supabase para SaaS multi-tenant — query keys com tenant, mutations com invalidação seletiva, optimistic updates seguros, infinite queries para listas grandes, suspense queries, cache RLS-aware. Use ao implementar qualquer feature que faz read/write em Supabase pelo frontend.
---

# TanStack Query v5 + Supabase — receituário multi-tenant

## Princípios

1. **Toda query key inclui `company_id`** — separa cache por tenant.
2. **Mutations invalidam o mínimo possível** — `qk.invoices.list(co, ...)` não `qk.all`.
3. **Optimistic updates só em ações atômicas** — toggle, delete, edit simples.
4. **Erros 401/403/404 não retentam** — RLS bloqueou, não vai melhorar.
5. **`select:` para projeção** — evita re-render quando só uma parte mudou.

## Hook de query padrão

```ts
// src/features/invoices/hooks/use-invoices.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { useSession } from "@/features/auth/use-session";

interface Filters { status?: string; from?: string; to?: string }

export function useInvoices(filters: Filters = {}) {
  const { data: session } = useSession();
  const company_id = session?.company_id;

  return useQuery({
    queryKey: qk.invoices.list(company_id ?? "anon", filters),
    enabled: !!company_id,
    queryFn: async () => {
      let q = supabase.from("invoices").select("id, amount, status, created_at").order("created_at", { ascending: false });
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.from) q = q.gte("created_at", filters.from);
      if (filters.to) q = q.lte("created_at", filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
```

**Notas**:
- `enabled: !!company_id` evita query antes do session resolver.
- RLS já filtra por `company_id` no banco — você NÃO precisa adicionar `.eq("company_id", ...)`. Mas a query KEY tem o tenant para isolar cache se o usuário trocar.

## Hook de mutation padrão (com invalidação seletiva)

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { useSession } from "@/features/auth/use-session";

interface CreateInvoiceInput { amount: number; description: string }

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const company_id = session!.company_id;

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data, error } = await supabase
        .from("invoices")
        .insert({ amount: input.amount, description: input.description }) // company_id é setado pelo trigger
        .select("id, amount, status, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalida só listas, não detalhes individuais (que ainda valem)
      queryClient.invalidateQueries({ queryKey: qk.invoices.all(company_id), exact: false });
    },
  });
}
```

## Optimistic update — pattern seguro

Use APENAS para ações reversíveis e atômicas (toggle, single-field edit, delete):

```ts
export function useToggleInvoicePaid() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const company_id = session!.company_id;

  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("invoices").update({ paid }).eq("id", id);
      if (error) throw error;
    },

    // Optimistic
    onMutate: async ({ id, paid }) => {
      const listKey = qk.invoices.all(company_id);
      await queryClient.cancelQueries({ queryKey: listKey });

      const snapshots = queryClient.getQueriesData({ queryKey: listKey });
      queryClient.setQueriesData({ queryKey: listKey }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((inv) => (inv.id === id ? { ...inv, paid } : inv));
      });

      return { snapshots };
    },

    // Rollback em erro
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },

    // Sincronização com servidor
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices.all(company_id) });
    },
  });
}
```

## Infinite query (listas grandes / scroll infinito)

```ts
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 50;

export function useInvoicesInfinite() {
  const { data: session } = useSession();
  const company_id = session?.company_id;

  return useInfiniteQuery({
    queryKey: qk.invoices.list(company_id ?? "anon", { infinite: true }),
    enabled: !!company_id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("invoices")
        .select("id, amount, status, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : undefined, total: count };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
```

No componente:
```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInvoicesInfinite();
const all = data?.pages.flatMap(p => p.rows) ?? [];
```

## Realtime + TanStack Query (sem refetch desnecessário)

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { useSession } from "@/features/auth/use-session";

export function useInvoicesRealtimeSync() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.company_id) return;
    const channel = supabase
      .channel(`invoices-${session.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `company_id=eq.${session.company_id}` },
        (payload) => {
          // Atualiza cache cirurgicamente (ou invalida se for muita mudança)
          if (payload.eventType === "INSERT") {
            queryClient.setQueriesData({ queryKey: qk.invoices.all(session.company_id) }, (old: any) => {
              if (!Array.isArray(old)) return old;
              return [payload.new, ...old];
            });
          } else if (payload.eventType === "UPDATE" || payload.eventType === "DELETE") {
            queryClient.invalidateQueries({ queryKey: qk.invoices.all(session.company_id) });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, session?.company_id]);
}
```

**Nota**: RLS aplica a Realtime — então mesmo sem o `filter: company_id=eq.X`, você só receberia eventos das próprias linhas. Mas filtrar reduz tráfego.

## Mutations chamando Edge Function (LLM, WhatsApp)

```ts
export function useSendWhatsApp() {
  const { data: session } = useSession();

  return useMutation({
    mutationFn: async (input: { to: string; message: string }) => {
      const { data, error } = await supabase.functions.invoke("wa-send-zapi", {
        body: { ...input, client_msg_id: crypto.randomUUID() }, // idempotência
      });
      if (error) throw error;
      return data;
    },
  });
}
```

`supabase.functions.invoke` adiciona automaticamente o JWT no Authorization header. Não chame `fetch()` direto.

## Anti-padrões

- ❌ Query key sem `company_id` em SaaS multi-tenant
- ❌ `invalidateQueries({ queryKey: qk.all })` em mutation pequena (invalida tudo)
- ❌ `staleTime: 0` por padrão (refetch sem necessidade, custa $)
- ❌ Optimistic update em ação não-reversível (criar registro complexo)
- ❌ `useQuery` em useEffect (fora do componente)
- ❌ Esquecer `enabled` quando depende de session/company_id
- ❌ `onSuccess` para fazer side effect que devia estar em onSettled
