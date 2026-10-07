# API pública e chaves emitidas para clientes

> Padrão SaaS v3.1 — documento normativo. Não edite o corpo por projeto; adaptações vão em "Particularidades deste projeto", no final.
> Leia quando o produto expõe API, webhooks de saída ou chaves de acesso **para os seus clientes** integrarem sistemas deles.
> Chaves de provedores que **você** consome (Meta, Z-API, gateway) seguem INTEGRATIONS.md e SECURITY.md §6.

## 1. Chave de API do cliente [N1]

- Gerada pelo servidor com entropia alta (≥ 256 bits), formato `<prefixo_produto>_<ambiente>_<id_curto>_<segredo>`, ex.: `mf_live_a1b2c3_…`. O prefixo permite reconhecer a chave num vazamento e configurar secret scanning.
- **Mostrada uma única vez**, na criação. O banco guarda só o **hash** (SHA-256 do segredo; a chave já é aleatória, não precisa de hash lento) e os primeiros caracteres para identificação na tela.
- Registro: `id`, `company_id`, `name`, `prefix`, `hash`, `scopes`, `location_id` opcional, `created_by`, `created_at`, `expires_at`, `last_used_at`, `revoked_at`.
- A chave pertence à **empresa** e age com os escopos dela, nunca com os de um usuário. Quem cria a chave só concede escopos que possui (ACCESS_CONTROL §6).
- Escopos usam as mesmas chaves de permissão do catálogo (`financeiro.contas_pagar.ver`).
- Revogação imediata, expiração opcional, rotação com sobreposição (a nova funciona antes de a antiga morrer).
- `last_used_at` atualizado de forma amostrada (não a cada requisição) para não virar gargalo de escrita.

## 2. Autenticação e tenant [N1]

- Chave no header `Authorization: Bearer`, nunca em query string.
- O servidor busca pelo id curto, compara o hash em tempo constante e resolve `company_id` **da chave**. Nenhum campo do corpo escolhe empresa.
- Empresa em `read_only` aceita só leitura; `suspended`/`canceled` recusa tudo (TENANT_LIFECYCLE).
- A API pública chama os mesmos casos de uso da aplicação. Nada de lógica paralela.

## 3. Limites e abuso [N1]

- Rate limit por chave e por empresa, com cabeçalhos de limite e `Retry-After` no 429.
- Tamanho máximo de corpo e de página; paginação por cursor.
- Escrita exige `Idempotency-Key` do cliente; mesma chave com corpo diferente é conflito (INTEGRATIONS §8).
- Respostas de erro com código estável e mensagem sem detalhe interno.

## 4. Versionamento e depreciação [N2]

- Versão no path (`/v1/`). Mudança incompatível vai para nova versão; campos novos opcionais não quebram.
- Depreciação anunciada com prazo, cabeçalhos `Deprecation`/`Sunset` e aviso aos clientes que ainda usam a versão (descobertos pelo log de uso por chave).
- Especificação OpenAPI gerada a partir dos schemas de validação, publicada junto da versão.

## 5. Webhooks de saída

Seguem INTEGRATIONS §13: assinatura HMAC por cliente com timestamp, `event_id`, retries com backoff, política de URL de §6 e desativação após falhas persistentes.

## 6. Observabilidade e auditoria [N1]

- Log por requisição: chave (id, nunca o segredo), empresa, rota, status, latência.
- Criação, rotação e revogação de chaves vão para o audit log.
- Alerta para uso de chave revogada ou de IP/volume fora do padrão.

## 7. Testes [N1]

- Chave revogada, expirada ou de outra empresa: negado.
- Escopo insuficiente: negado; escopo exato: permitido.
- Corpo tentando trocar `company_id`: ignorado.
- Repetição com a mesma `Idempotency-Key`: sem efeito duplicado.
- Segredo da chave nunca aparece em log, resposta ou tela depois da criação.

## Particularidades deste projeto

<!-- Prefixo das chaves; escopos disponíveis; limites por plano; versões ativas e datas de sunset. -->
