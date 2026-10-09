# Changelog — padrao-saas

## 3.2.0

- **check-padrao nos dois sentidos.** Padrão listado no manifest e ausente no projeto agora falha (na 3.1 passava em silêncio). O manifest separa obrigatórios e opcionais; opcional não adotado é declarado em `.claude/padrao.json` com motivo. Também confere o `.claude/tenancy-profile.yml` e avisa quando o AGENTS.md passa de 200 linhas.
- **Portabilidade obrigatória desde o N1.** `GCP_MIGRATION` não pode mais ser "não adotado"; a migração de infraestrutura continua só com gatilho.
- **`scripts/check-portabilidade.mjs`** (novo, sem dependências): acusa SDK ou cliente Supabase importado fora dos adapters, `.from()`/`.rpc()`/`.functions.invoke()`/`.storage`/`.channel()` fora dos adapters, `Deno.*` fora do entrypoint da Edge Function e empresa ativa lida do token. Linha de base para projeto legado: o CI barra só dívida nova.
- **A tela chama só o adapter do módulo** (`src/features/<m>/api.ts`): ARCHITECTURE §2–3, AGENTS §3, MODULES §5, skill novo-modulo.
- **Identidade portável no SQL de referência:** `private.current_user_id()` no lugar de `auth.uid()`, FKs para `public.app_users`, adapters `00_identidade_supabase.sql` e `00_identidade_postgres.sql`. O núcleo não referencia mais o schema `auth`.
- **Grants explícitos** no exemplo de módulo e regra nova em DATABASE §5: não depender dos default privileges do Supabase (achado ao rodar o SQL num Postgres puro).
- **Testes do kit:** 14 do check-padrao, 9 do check-portabilidade e o SQL em pgTAP nos dois adapters (33 + 5 cenários), rodando no CI do repositório.

## 3.1.0

Primeira versão como plugin (antes: kit avulso v3.0 copiado para `~/.claude/skills`).

- **Modelo de acesso:** empresa → filial → usuário em várias empresas; papéis por empresa; concessões diretas; permissões `<modulo>.<submodulo>.<acao>` com concessão por prefixo; módulos contratados por empresa; status `read_only`/`suspended`. Novo padrão ACCESS_CONTROL e SQL de referência com 29 testes pgTAP.
- **Tenancy declarada no `.claude/tenancy-profile.yml`** (compatível com saas-shield-br, arquétipo E). MULTI_TENANCY neutro, com empresa ativa na URL e teste de mistura entre empresas do mesmo usuário.
- **Novos padrões:** MODULES (criar, alterar, remover módulo + DoD), TENANT_LIFECYCLE (provisionamento, planos, cobrança, suspensão, exclusão), PUBLIC_API (chaves emitidas a clientes).
- **Manifest com hash** do corpo de cada padrão e `scripts/check-padrao.mjs` para o CI.
- **Codex:** regras de `.claude/rules/` geradas em `supabase/AGENTS.md`.
- **Runtime Vite** documentado (Edge Functions/RPC como servidor).
- **settings.json:** `.env` em subpastas, chaves e service accounts; variações `npx`/`pnpm dlx`/`bunx`; descarte de trabalho local; `gh`, `psql`, `gcloud`, `terraform`; MCP Supabase e Vercel em fragmentos separados.
- **Correções:** `/doctor prompt-audit` (inexistente) substituído por `/doctor`; política de commit (local liberado, push pede confirmação); previews sem efeito real; FORCE RLS com checagem de BYPASSRLS; idempotência devolve o resultado original; retenção e limpeza de tabelas técnicas; manutenção contínua e upgrade de plataforma; camada web (CSP, CORS); acesso de suporte e audit log; fallback de IA só sem efeito externo; severidade P0–P3.
