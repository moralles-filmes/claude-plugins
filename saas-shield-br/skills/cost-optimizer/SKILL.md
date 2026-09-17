---
name: cost-optimizer
description: Reduz a CONTA de Supabase + Vercel — egress do banco, invocações de Edge Function/Functions, mensagens e conexões Realtime, storage, bandwidth e build minutes. Use quando o usuário pedir "tá caro o Supabase", "a conta da Vercel subiu", "reduzir custo de infra", "estourou o limite do plano", "egress alto", "muitas invocações", ou ao revisar custos de infra. NÃO cobre lentidão (queries lentas, EXPLAIN, índices, RLS lenta, re-render, bundle como tempo de carga) — isso é do plugin `turbo` (skills `db-perf` e `frontend-perf`).
---

# cost-optimizer

Você reduz o **custo em dinheiro** de SaaS em Supabase + Vercel + React/Vite. Foca em cortes concretos de $/mês, com impacto estimado — não em micro-otimizações.

## Fronteira com o `turbo`

Performance é do plugin **`turbo`**: `db-perf` (query lenta, EXPLAIN, índices, RLS lenta, N+1, paginação, pooling) e `frontend-perf` (travamento, re-render, INP, memory leak, bundle). Muitas correções reduzem custo **e** latência; quando o sintoma principal for lentidão, encaminhe para o `turbo` em vez de repetir o diagnóstico aqui.

Esta skill olha a **fatura**: o que está sendo cobrado, quanto, e qual ação corta mais dinheiro por esforço.

Convenção de tenant: `<TC>` é a coluna de tenant do projeto, resolvida pela skill `tenant-model` (`.claude/tenancy-profile.yml`). Não assuma `company_id`.

## Passo 1 — de onde vem a conta

Antes de propor mudança, identifique a linha da fatura que domina:

- **Supabase** (Usage da organização/projeto): egress, tamanho do banco, invocações de Edge Function, mensagens e pico de conexões Realtime, storage, MAU.
- **Vercel** (Usage): invocações e duração de Functions, bandwidth/data transfer, build minutes, otimização de imagem.

Se você não tem acesso aos painéis, peça os números do período ao usuário. Sem saber qual linha domina, não priorize.

## Área 1 — Egress do banco

**Sintoma**: egress alto, respostas grandes.

**Causas comuns**:
- `select('*')` trazendo colunas pesadas (`notes` text, `metadata` jsonb, blobs).
- Listas sem paginação.
- N requests por tela (N+1) multiplicando o tráfego.
- Refetch sem cache (TanStack Query com `staleTime: 0` refaz tudo a cada montagem).

**Correções**:
```tsx
// ❌ traz todas as colunas e todas as linhas
.from('invoices').select('*')

// ✅ só o que a tela usa, paginado
.from('invoices').select('id, number, status, total_cents, created_at').range(0, 49)
```
- Paginação keyset para listas grandes e N+1 → select aninhado/RPC: diagnóstico e padrão em `turbo:db-perf`.
- `staleTime` por tipo de dado no client (skill `tanstack-query-supabase` do `saas-builder-br`, se instalada).

## Área 2 — Realtime (mensagens e conexões)

**Sintoma**: contador de mensagens ou pico de conexões Realtime alto.

**Causas comuns**:
- Um channel por componente em vez de um compartilhado.
- `event: '*'` quando só precisa de `UPDATE`.
- Assinatura sem filtro de tenant (recebe — e é cobrado por — eventos que não usa).
- Channel sem `removeChannel` no cleanup (conexões acumulam a cada navegação).

```ts
// ✅ um channel compartilhado, evento específico, filtrado por tenant
const channel = supabase
  .channel(`invoices-${tenantId}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `<TC>=eq.${tenantId}` },
    () => queryClient.invalidateQueries({ queryKey: ['invoices', tenantId] }),
  )
  .subscribe()

// no cleanup do useEffect / provider
supabase.removeChannel(channel)
```

A RLS continua sendo a fronteira de segurança; o filtro aqui é para custo.

## Área 3 — Invocações de Edge Function / Vercel Functions

**Sintoma**: invocações ou duração acima do esperado.

**Causas comuns**:
- Chamada por tecla (autocomplete sem debounce).
- Polling curto.
- Função chamada para dado que poderia vir de cache ou CDN.
- Função esperando API externa lenta dentro da request (duração cobrada).

**Correções**:
- Debounce/throttle no client.
- Trocar polling por Realtime ou webhook.
- `Cache-Control` com `s-maxage`/`stale-while-revalidate` em respostas cacheáveis.
- Cache de respostas determinísticas (ex.: LLM com temperatura 0 — skill `llm-multi-provider` do `saas-builder-br`).
- Trabalho demorado vai para fila/cron; a request só enfileira e responde.

## Área 4 — Bandwidth e build (Vercel)

- **Bandwidth**: assets com hash sem cache imutável; imagens sem dimensionamento/formato moderno; SVG e base64 inline gigantes. Corrija cache, compressão (brotli) e imagens.
- **Build minutes**: rebuild completo a cada push em branch irrelevante (use Ignored Build Step), sem cache de dependências, previews onde ninguém olha.
- Bundle grande também custa bandwidth; para o diagnóstico do bundle (analyzer, code splitting, libs pesadas) use `turbo:frontend-perf`.

## Área 5 — Storage e crescimento do banco

- Tabelas de log/eventos sem retenção (`webhook_events`, `api_usage`, auditoria) → política de retenção, particionamento ou purge agendado.
- Arquivos órfãos no Storage (upload sem referência no banco) → job de limpeza.
- Índices não usados ocupam disco e encarecem escrita → confirmar uso antes de remover (critério em `turbo:db-perf`).

## Custos típicos a vigiar

Valores de referência — confira a tabela de preços vigente do Supabase e da Vercel antes de estimar economia.

| Recurso | Limite gratuito Supabase | Custo após | Otimização |
|---|---|---|---|
| DB egress | 5 GB/mês | $0.09/GB | Specifique colunas, paginação, ETag |
| Edge Functions invocations | 500k/mês | $2/M | Cache de respostas, debounce no client |
| Realtime msgs | 2M/mês | $2.50/M | Filtros, channels compartilhados |
| Vercel build minutes | 100/mês free | $0.40/min | Cache, evitar rebuild full |
| Vercel bandwidth | 100GB | $0.15/GB | CDN bem configurado, ISR, brotli |

## Saída do otimizador

Sempre estruture:

```
💰 RELATÓRIO DE CUSTO — <projeto>

🔍 Diagnóstico (linha da fatura → causa)
  - <achado #1> → impacto estimado: $X/mês
  - <achado #2> → impacto estimado: $Y/mês

🎯 Top 3 ações (ordem de retorno):
  1. <ação> — esforço: <baixo/médio/alto> — economia: <%>
  2. <ação>
  3. <ação>

📐 Implementação detalhada:
  <SQL ou diff por ação>

📊 Custo projetado depois: $<atual> → $<otimizado> (-<%>)

↪️ Encaminhado ao turbo: <itens que são de performance, se houver>
```

## Eficiência da skill

- Não invente números de consumo — peça os valores do painel.
- Carregue só as áreas da linha da fatura que domina.
- Numere ações por ROI (dinheiro economizado / esforço), não por categoria.
