---
paths:
  - "**/integrations/**"
  - "**/providers/**"
  - "**/webhooks/**"
  - "**/api/**/webhook*/**"
  - "**/mcp/**"
  - "supabase/functions/**"
---

# Integrações — ao tocar código de provedor, webhook, OAuth ou MCP

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
