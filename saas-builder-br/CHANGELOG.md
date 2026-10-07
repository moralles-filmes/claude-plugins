# CHANGELOG

## [1.4.0] — 2026-10-07

### Alterado
- **Padrão SaaS como norma.** O `arquiteto-chefe` pede `/padrao-saas:aplicar` antes da Fase 1 quando o repo não tem `docs/standards/`, cita o padrão relevante em cada delegação e, em projeto novo, propõe o arquétipo **E** (empresa → filial, usuário em várias empresas, permissões por módulo/submódulo/ação, módulos contratados). A spec passa a ter a árvore de módulos → submódulos → ações e os papéis de sistema.

### Corrigido
- **`integrador-apis`: retry só com erro transitório E repetição segura.** O princípio "toda chamada externa tem retry, 3 tentativas" repetia POST com efeito externo em 5xx mesmo quando o provedor não deduplica, o que pode cobrar ou enviar duas vezes. `withRetry` agora exige `{ safe }`: sem idempotência remota, uma tentativa e resultado ambíguo vira `UNKNOWN`. Só 408/429/502/503/504 e falha de transporte contam como transitórios. A chave de idempotência do exemplo é prefixada pelo tenant resolvido no servidor.
- **`llm-multi-provider`:** fallback entre providers só em geração sem ferramenta com efeito externo; cada provider da cadeia precisa estar no inventário LGPD. A Edge Function deixa de devolver a mensagem de erro do provider ao cliente (`llm_unavailable`, 502).

## [1.3.0] — 2026-09-18

### Corrigido
- **Convention-driven completo.** Só o `db-schema-designer` lia o `.claude/tenancy-profile.yml`; `arquiteto-chefe`, `arquiteto-saas`, `backend-supabase`, `qa-testes`, `/novo-saas` e as skills `whatsapp-zapi-integracao`/`llm-multi-provider` ainda hardcodavam `company_id`, `get_current_company_id()`, trigger `force_company_id` e "padrão MarginPro". Agora: o `arquiteto-saas` escolhe o arquétipo (A/B/C/D) na spec, o `arquiteto-chefe` exige o profile como entregável da Fase 2 e passa a tenancy no template de delegação, o `backend-supabase` resolve o tenant pelo profile (JWT no A, membership nos demais), e os exemplos com `company_id` estão marcados como ilustração do arquétipo A.
- **Template de Edge Function unificado** com o `edge-function-guard` do saas-shield-br: `Deno.serve` nativo + `jsr:@supabase/supabase-js@2` em `backend-supabase`, `llm-multi-provider` e `whatsapp-zapi-integracao` (saíram `std@0.224/http/server.ts` e `esm.sh`). Antes o gate auditava contra um template e o builder gerava outro.
- **`vercel.json` unificado** com o `vercel-deploy-guard` (fonte canônica): `devops-ci` referencia a skill e o job `migration-check` do CI aponta para o `schema-diff`.
- `llm-multi-provider`: o catálogo `MODELS` (gpt-4o/o3-mini/claude-4.6/gemini-2.0) estava desatualizado e sem aviso. Passa a ser explicitamente um formato de exemplo com IDs da família Claude 5, com instrução de conferir IDs/preços na skill `claude-api` (Anthropic) e nas páginas dos providers, data de conferência no arquivo e teste que falha após 90 dias.

## [1.2.1] e anteriores

Sem changelog. Ver histórico do git.
