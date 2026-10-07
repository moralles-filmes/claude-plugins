<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em supabase/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## Banco de dados — ao tocar SQL ou migrations

Antes de criar ou alterar migration, policy, função ou índice, leia `docs/standards/DATABASE.md`, `docs/standards/MULTI_TENANCY.md` e, se a tabela pertence a um módulo, `docs/standards/ACCESS_CONTROL.md`.

Pontos que mais causam vazamento ou perda de dados:

- Migration já aplicada não é editada. Crie uma nova (forward-only).
- Toda tabela nova em schema exposto recebe, na **mesma** migration: RLS habilitada e forçada, policies e revisão dos grants de `anon`/`authenticated`.
- Tabela da empresa filtra por `company_id`; tabela da filial filtra por `location_id` e tem FK composta `(company_id, location_id)`. Policies usam os helpers com a permissão `ver` do submódulo dono.
- Policies de insert e update usam `with check`.
- Relacionamento entre tabelas do mesmo tenant usa FK composta `(company_id, <fk>)`. FK simples não garante o mesmo tenant, e a checagem de FK ignora RLS.
- Transição crítica (baixa, aprovação, estorno) não tem grant de update na coluna de estado: passa por RPC ou caso de uso que confere a ação.
- Permissão nova entra no catálogo (`permissions`) por migration, junto com a concessão aos papéis de sistema. Chave de permissão não é renomeada em lugar.
- Views em schema exposto usam `with (security_invoker = true)`.
- Funções `security definer`: `set search_path = ''`, nomes qualificados, fora de schema exposto salvo intenção explícita, checagem de tenant interna.
- Funções novas são executáveis por `PUBLIC` por padrão. Revogue e conceda explicitamente.
- Invariantes que dependem do estado atual (saldo, estoque, status) são garantidas na mesma transação da mutação.
- Valores monetários em `numeric` ou centavos inteiros, nunca float.
- Migration remota exige autorização explícita. Depois de aplicar localmente, rode os Advisors e `supabase test db`.

## Integrações — ao tocar código de provedor, webhook, OAuth ou MCP

Antes de alterar, leia `docs/standards/INTEGRATIONS.md` e o `docs/integrations/providers/<provider>.md` do provedor envolvido. Confirme a versão vigente da API na documentação oficial; não codifique versão ou política de memória.

Pontos que mais causam incidente:

- O módulo depende de uma porta (capacidade). URL, token, SDK e formato do provedor ficam no adapter.
- **Webhook:**
  - verifique a autenticidade sobre o corpo **bruto**, antes de qualquer `JSON.parse`, com comparação em tempo constante;
  - o tenant vem da conexão vinculada à conta externa, nunca do payload;
  - persista o evento com dedup durável antes de responder 2xx e processe de forma assíncrona;
  - eventos chegam duplicados e fora de ordem: nenhum status regride.
- **Efeito externo** (envio, cobrança):
  - chave de idempotência com a coluna de tenant e a intenção;
  - resultado ambíguo vira `UNKNOWN` e é reconciliado antes de qualquer repetição.
- **Retry automático** só com erro transitório **e** repetição comprovadamente segura. Nunca em 4xx definitivo, validação ou autorização.
- **Fallback entre provedores** nunca é automático quando pode duplicar o efeito. Em IA, só em geração sem efeito externo.
- **Credenciais** só no servidor e nunca em logs. Alguns provedores (ex.: Z-API) põem o token no path da URL: redija a URL inteira.
- **Testes, CI e previews** usam fake adapter ou sandbox. Nunca disparam efeito real.

## Segurança, acesso e multi-tenancy — ao tocar auth, permissões ou código de servidor

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
