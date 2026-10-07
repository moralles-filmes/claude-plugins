# Changelog — padrao-saas

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
