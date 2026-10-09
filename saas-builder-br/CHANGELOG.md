# CHANGELOG

## [1.5.0] — 2026-10-08

### Alterado
- **Arquétipo E é o padrão de projeto novo em todo o plugin** (`/novo-saas`, `arquiteto-chefe`, `arquiteto-saas`, `db-schema-designer`). A–D só quando o `.claude/tenancy-profile.yml` de um projeto existente os declara. A spec ganhou a árvore módulo → submódulo → ação, papéis de sistema e tabelas da empresa x da filial.
- **Frontend no padrão de fronteira**: empresa ativa na URL (`/app/:empresa`, `useActiveCompany()`), adapter `src/features/<modulo>/api.ts` como único arquivo que fala com o Supabase, `.eq("company_id", …)` (e filial) em toda query de tela, query keys começando pelo `companyId`, cache descartado ao trocar de empresa e no logout, transições críticas por `supabase.rpc(...)`, `useCan()` a partir de `my_permissions` (só UX).
- **`backend-supabase`** focado na estrutura do caso de uso (ARCHITECTURE §5), domínio sem runtime em `supabase/functions/_shared/` e provisionamento de empresa por RPC. O template de Edge Function e o helper de tenant passam a vir só da skill `saas-shield-br:edge-function-guard`.
- **`db-schema-designer`** sem template SQL próprio: gera pela skill `saas-shield-br:supabase-migrator` e pelos `templates/sql/` do `padrao-saas`; mantém só as decisões do builder (catálogo, empresa x filial, FK composta, RPC, pgTAP).
- **`devops-ci`**: CI no PR sem segredo de produção (lockfile congelado, lint, typecheck, testes, build, `check-padrao`, `check-portabilidade`, `supabase db reset` + `supabase test db` no stack local); produção num GitHub Environment com aprovação manual, `needs:` do CI, `db push` sem `--include-all`. O `vercel.json` vem só do `saas-shield-br:vercel-deploy-guard`.
- **`qa-testes`**: pgTAP para empresa, filial, submódulo, ação e update direto; teste de frontend de que filtro e chave isolam o mesmo usuário em X e Y; Edge Function com empresa do header sem membership.

### Corrigido
- `tanstack-query-supabase` dizia que não era preciso filtrar `company_id` porque a RLS já filtra — com o mesmo usuário em duas empresas, a tela misturava as duas. Também tirava a empresa do `app_metadata` e fazia `invoices.update({ paid })` direto do hook.
- `backend-supabase` devolvia a mensagem da exceção em erro 500; agora só o código normalizado (`toHttp`). Saíram o trigger de signup que gravava a empresa no JWT e as storage policies com `get_current_company_id()`.
- `whatsapp-zapi-integracao`: tokens Z-API/Meta saíram das colunas da tabela para o Supabase Vault (a conexão guarda o id); envio reserva a mensagem antes de chamar o provedor, resultado ambíguo vira `unknown` e o corpo do provedor não volta ao cliente; webhook Z-API com segredo por conexão no path, inbox durável antes do 2xx e status sem regressão.
- `llm-multi-provider`: chave do Gemini saiu da query string para header; `api_usage.user_id` aponta para `public.app_users`; streaming do cliente movido para o `api.ts` com `x-company-id`.
- `integrador-apis`: `Deno.serve`, empresa pela membership e resposta sem o corpo do provedor.
- `frontend-react` listava `@supabase/auth-helpers-react` (descontinuado).
- README mostrava a versão 1.0.0.

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
