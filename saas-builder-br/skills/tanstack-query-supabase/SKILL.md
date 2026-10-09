---
name: tanstack-query-supabase
description: Padrões TanStack Query v5 + Supabase para SaaS multi-tenant no Padrão SaaS — empresa ativa vinda da URL, adapter api.ts por módulo (único arquivo que fala com o Supabase), filtro pela empresa e pela filial em toda query de tela, query keys começando pelo companyId, transições críticas por RPC, Realtime filtrado e permissões só para UX. Use ao implementar qualquer feature que lê ou escreve no Supabase pelo frontend.
---

# TanStack Query v5 + Supabase — receituário multi-tenant

## Regras

1. **A empresa ativa vem da URL** (`/app/:empresa/...`) via `useActiveCompany()`. Nunca de claim do token nem de estado global.
2. **A tela chama o adapter do módulo**, `src/features/<modulo>/api.ts`. Só ele importa `@/lib/supabase/client` e chama `.from()`, `.rpc()`, `.functions.invoke()` e `.channel()`. Hooks e componentes importam funções do `api.ts`; tipos do banco entram com `import type`.
3. **Toda query de tela filtra pela empresa ativa** (`.eq("company_id", companyId)`) e pela filial quando a tela opera numa. A RLS é a cerca e libera **todas** as empresas do usuário; o filtro é o foco. Sem ele, quem é membro de X e Y vê linhas de Y na tela de X (ACCESS_CONTROL §7).
4. **A query key começa pelo `companyId`.** Logout limpa o cache; sair de uma empresa remove as queries dela.
5. **Transição crítica** (baixar, aprovar, estornar, enviar) vai por `supabase.rpc(...)` ou Edge Function **dentro do `api.ts`**, sem optimistic update. O banco não aceita update direto na coluna de estado.
6. **401/403/404 não retentam.**
7. **Permissões na tela são só UX** (menu, botões), a partir de `my_permissions`. Quem garante é RLS + RPC.

> Exemplos no arquétipo E com o módulo de referência do padrão: `bills` (contas a pagar, tabela da filial) e a RPC `baixar_conta_pagar`. Em projeto A–D, troque as colunas pelas do `.claude/tenancy-profile.yml` e mantenha adapter, filtro e chave.

## Setup base

### `src/lib/query/client.ts`

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error && typeof error === "object" && "status" in error) {
          const s = (error as { status: number }).status;
          if (s === 401 || s === 403 || s === 404) return false; // RLS/permissão: não vai melhorar
        }
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
```

### `src/lib/query/keys.ts`

```ts
import type { BillFilters } from "@/features/financeiro/api";

// Toda chave começa pelo companyId: o cache de uma empresa nunca serve outra.
const billsAll = (companyId: string) => [companyId, "financeiro", "contas_pagar"] as const;
const billsLists = (companyId: string) => [...billsAll(companyId), "list"] as const;

export const qk = {
  company: (companyId: string) => [companyId] as const,
  permissions: (companyId: string) => [companyId, "permissions"] as const,
  bills: {
    all: billsAll,
    lists: billsLists,
    list: (companyId: string, filters: BillFilters, page: number) =>
      [...billsLists(companyId), filters, page] as const,
  },
};
```

## Empresa ativa e permissões — `src/features/empresa/`

```ts
// src/features/empresa/api.ts — adapter: único arquivo do módulo que importa o cliente Supabase
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type ActiveCompany = Pick<Tables<"companies">, "id" | "slug" | "name" | "status">;
export type MyPermission = { permission: string; location_id: string | null };

// A RLS de companies só devolve empresas em que o usuário é membro ativo: slug alheio = null.
export async function getCompanyBySlug(slug: string): Promise<ActiveCompany | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, slug, name, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyPermissions(companyId: string): Promise<MyPermission[]> {
  const { data, error } = await supabase.rpc("my_permissions", { p_company_id: companyId });
  if (error) throw error;
  return data;
}
```

```ts
// src/features/empresa/use-active-company.ts
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { qk } from "@/lib/query/keys";
import { getCompanyBySlug, listMyPermissions } from "./api";

// Única chave sem companyId na frente: é ela que descobre o companyId.
export const companyBySlugQuery = (slug: string) =>
  queryOptions({ queryKey: ["empresa-por-slug", slug] as const, queryFn: () => getCompanyBySlug(slug) });

export function useActiveCompany() {
  const { empresa } = useParams();
  if (!empresa) throw new Error("useActiveCompany fora de /app/:empresa");
  const { data } = useSuspenseQuery(companyBySlugQuery(empresa));
  if (!data) throw new Error("empresa_indisponivel"); // o loader da rota já redirecionou
  return data;
}

// /app/:empresa/f/:filial/... quando a tela opera numa filial
export function useActiveLocationId(): string | undefined {
  return useParams().filial;
}

// Só UX. my_permissions já aplica módulo contratado, status da empresa e padrões de concessão.
// Sem locationId: tem a permissão em alguma filial (menu). Com locationId: vale para aquela filial.
export function useCan(permission: string, locationId?: string): boolean {
  const company = useActiveCompany();
  const { data = [] } = useQuery({
    queryKey: qk.permissions(company.id),
    queryFn: () => listMyPermissions(company.id),
  });
  return data.some(
    (p) => p.permission === permission && (locationId === undefined || p.location_id === null || p.location_id === locationId),
  );
}
```

Use o tipo gerado do catálogo de permissões (ACCESS_CONTROL §2) no lugar de `string` quando existir. A rota `/app/:empresa` e a limpeza de cache ao trocar de empresa estão na skill `vite-react-arquitetura`.

## Adapter do módulo — `src/features/financeiro/api.ts`

```ts
// Único arquivo do módulo financeiro que importa o cliente Supabase.
// Trocar o Supabase por API própria = reescrever este arquivo (GCP_MIGRATION §6).
import { supabase } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/supabase/types";

const BILL_COLUMNS = "id, company_id, location_id, supplier_id, amount_cents, due_date, status";
export type Bill = Pick<
  Tables<"bills">,
  "id" | "company_id" | "location_id" | "supplier_id" | "amount_cents" | "due_date" | "status"
>;
export type NewBill = Pick<TablesInsert<"bills">, "location_id" | "supplier_id" | "amount_cents" | "due_date">;
export interface BillFilters { locationId?: string | undefined; status?: string | undefined }
export const PAGE_SIZE = 50;

export async function listBills(companyId: string, f: BillFilters, page: number): Promise<Bill[]> {
  let q = supabase.from("bills").select(BILL_COLUMNS).eq("company_id", companyId); // foco na empresa ativa
  if (f.locationId) q = q.eq("location_id", f.locationId);                          // e na filial da tela
  if (f.status) q = q.eq("status", f.status);
  const from = page * PAGE_SIZE;
  const { data, error } = await q
    .order("due_date", { ascending: true })
    .order("id", { ascending: true }) // desempate estável
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return data;
}

export async function createBill(companyId: string, input: NewBill): Promise<Bill> {
  // company_id e location_id são conferidos no banco: with check da policy + FK composta.
  const { data, error } = await supabase
    .from("bills")
    .insert({ ...input, company_id: companyId })
    .select(BILL_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateBillDueDate(companyId: string, id: string, dueDate: string): Promise<void> {
  const { error } = await supabase
    .from("bills")
    .update({ due_date: dueDate })
    .eq("company_id", companyId)
    .eq("id", id);
  if (error) throw error;
}

// Transição crítica: a RPC confere "financeiro.contas_pagar.baixar". Update de status é negado pelo banco.
export async function payBill(id: string): Promise<Bill> {
  const { data, error } = await supabase.rpc("baixar_conta_pagar", { p_bill_id: id });
  if (error) throw error; // CONTA_INDISPONIVEL: não existe, já baixada ou sem permissão
  return data;
}

// A RLS entrega eventos de todas as empresas do usuário: o filtro de company_id não é opcional.
export function subscribeBills(companyId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`bills:${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `company_id=eq.${companyId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
```

## Hooks — não importam o cliente Supabase

```ts
// src/features/financeiro/hooks/use-bills.ts
import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/features/empresa/use-active-company";
import { qk } from "@/lib/query/keys";
import {
  createBill, listBills, payBill, subscribeBills, updateBillDueDate,
  PAGE_SIZE, type Bill, type BillFilters, type NewBill,
} from "../api";

export function useBills(filters: BillFilters, page = 0) {
  const company = useActiveCompany();
  return useQuery({
    queryKey: qk.bills.list(company.id, filters, page),
    queryFn: () => listBills(company.id, filters, page),
    // Mantém a página anterior durante a paginação, nunca dados de OUTRA empresa.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[0] === company.id ? prev : undefined),
  });
}

export function useBillsInfinite(filters: BillFilters) {
  const company = useActiveCompany();
  return useInfiniteQuery({
    queryKey: [...qk.bills.all(company.id), "infinite", filters] as const, // fora de "list": o dado é InfiniteData
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listBills(company.id, filters, pageParam),
    getNextPageParam: (lastRows, _pages, lastParam) => (lastRows.length === PAGE_SIZE ? lastParam + 1 : undefined),
  });
}

export function useCreateBill() {
  const company = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBill) => createBill(company.id, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.bills.all(company.id) }),
  });
}

// Transição crítica: RPC no api.ts, sem optimistic update.
export function usePayBill() {
  const company = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => payBill(billId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.bills.all(company.id) }),
  });
}

// Optimistic só em edição simples e reversível.
export function useUpdateBillDueDate() {
  const company = useActiveCompany();
  const queryClient = useQueryClient();
  const lists = qk.bills.lists(company.id);
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) => updateBillDueDate(company.id, id, dueDate),
    onMutate: async ({ id, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: lists });
      const snapshots = queryClient.getQueriesData<Bill[]>({ queryKey: lists });
      queryClient.setQueriesData<Bill[]>({ queryKey: lists }, (old) =>
        old?.map((b) => (b.id === id ? { ...b, due_date: dueDate } : b)),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: lists }),
  });
}

export function useBillsRealtime() {
  const company = useActiveCompany();
  const queryClient = useQueryClient();
  useEffect(
    () => subscribeBills(company.id, () => void queryClient.invalidateQueries({ queryKey: qk.bills.all(company.id) })),
    [company.id, queryClient],
  );
}
```

## Edge Function a partir do `api.ts` (WhatsApp, LLM)

```ts
// src/features/whatsapp/api.ts
import { supabase } from "@/lib/supabase/client";

export async function sendWhatsApp(
  companyId: string,
  input: { to: string; message: string; clientMsgId: string },
): Promise<{ id: string } | null> {
  const { data, error } = await supabase.functions.invoke<{ id: string }>("wa-send-zapi", {
    headers: { "x-company-id": companyId }, // indica a empresa; a função confirma a membership
    body: { to: input.to, message: input.message, client_msg_id: input.clientMsgId },
  });
  if (error) throw error;
  return data;
}
```

`functions.invoke` já manda o JWT. O `clientMsgId` nasce uma vez por intenção (no submit) e é reaproveitado se o usuário repetir, para a função deduplicar.

## Anti-padrões

- ❌ `supabase.from/.rpc/.functions.invoke/.channel` em hook ou componente — vai para o `api.ts`
- ❌ Query de tela sem `.eq("company_id", companyId)` "porque a RLS já filtra"
- ❌ Query key sem o `companyId` na primeira posição
- ❌ Empresa ativa lida do token ou de store global em vez da URL
- ❌ `keepPreviousData` direto em lista por empresa (mostra a empresa anterior durante a troca)
- ❌ `update({ status })`/`update({ paid })` direto — transição crítica é RPC
- ❌ Optimistic update em transição crítica
- ❌ Realtime sem filtro de `company_id`
- ❌ `invalidateQueries` sem chave em mutation pequena; `staleTime: 0` por padrão
- ❌ Esconder botão como se fosse autorização
