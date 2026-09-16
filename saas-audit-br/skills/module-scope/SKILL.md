---
name: module-scope
description: Protocolo interno para descobrir o escopo real de um módulo antes de auditá-lo: UI, API, banco, RLS, jobs, webhooks, integrações e dependências compartilhadas.
user-invocable: false
---

# Descoberta de módulo

Um módulo visual raramente corresponde a uma única pasta.

Para o módulo solicitado, localize:

- páginas/rotas;
- componentes;
- hooks/stores;
- services/repositories;
- route handlers / server actions;
- Edge Functions;
- RPCs/functions;
- tabelas/views;
- migrations;
- RLS/policies;
- storage;
- jobs/cron/queues;
- webhooks;
- integrações;
- testes;
- permissões/RBAC;
- eventos e efeitos colaterais.

Construa o fluxo:

`entrada -> autenticação -> autorização -> tenant -> regra -> persistência -> efeitos externos`

## Fronteira do escopo

Não transforme auditoria de módulo em auditoria total.

Porém, NÃO classifique como “fora do escopo” uma causa raiz compartilhada em:
- auth;
- RBAC;
- tenancy;
- RLS;
- billing;
- webhook;
- storage;
- IA/tooling;
- função compartilhada.

Nesses casos:
1. corrija somente a menor causa raiz necessária;
2. identifique consumidores afetados;
3. rode regressão nesses consumidores.

## Saída

Retorne:
- mapa do módulo;
- arquivos/camadas;
- dependências;
- ações de escrita;
- trust boundaries;
- pontos de maior risco;
- o que foi explicitamente excluído do escopo.
