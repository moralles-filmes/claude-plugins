---
paths:
  - "**/auth/**"
  - "**/middleware.{ts,js}"
  - "**/permissions/**"
  - "**/access/**"
  - "**/actions/**"
  - "**/*.action.{ts,tsx}"
  - "**/app/api/**"
  - "**/server/**"
  - "**/lib/supabase/**"
  - "supabase/functions/**"
---

# Segurança, acesso e multi-tenancy — ao tocar auth, permissões ou código de servidor

Antes de alterar, leia `docs/standards/SECURITY.md`, `docs/standards/MULTI_TENANCY.md` e `docs/standards/ACCESS_CONTROL.md`. O modelo do projeto está em `.claude/tenancy-profile.yml`.

Pontos que mais causam vazamento entre empresas ou escalada de privilégio:

- Autenticação, autorização e resolução de tenant são três verificações independentes.
- No servidor, valide o usuário com o método que confere o token no Supabase Auth (`getUser()`/`getClaims()`). Não confie em `getSession()` vindo de cookie.
- A empresa ativa vem da URL e é confirmada pela membership; a filial ativa, idem. Nunca de claim do JWT, body ou payload.
- Permissão é `<modulo>.<submodulo>.<acao>`, por empresa e filial. O caso de uso chama `can()` antes da transação; a RLS usa `private.allowed_company_ids` / `private.allowed_location_ids` dentro de `(select …)`.
- A RLS libera todas as empresas do usuário: toda query de tela filtra pela empresa ativa (e filial). Chave de cache começa por `company_id`.
- Campos de tenant, filial, papel, permissão, `is_owner`, preço, total e status vindos do cliente são ignorados ou revalidados. Nunca espalhe o body num insert/update.
- Tabelas de acesso não recebem escrita do cliente. Quem concede só concede o que tem; ninguém altera os próprios acessos; a empresa nunca fica sem proprietário.
- Service role / secret key ignora RLS: só em fluxo sistêmico, depois de resolver tenant e permissão, filtrando a coluna de tenant em toda query.
- Testes cobrem o bloqueio **e** o acesso legítimo: outra empresa, outra filial, outro submódulo, ação sem permissão, membership desativada.
