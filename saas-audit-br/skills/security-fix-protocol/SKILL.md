---
name: security-fix-protocol
description: Protocolo interno do saas-audit-br para corrigir findings com baixo risco, evidência, teste e regressão sem destruir trabalho existente nem executar mudanças irreversíveis em produção.
user-invocable: false
---

# Protocolo de correção

## Antes de editar

1. Leia `git status --short`.
2. Preserve mudanças preexistentes.
3. Nunca stage/commit mudanças do usuário como parte do audit sem pedido explícito.
4. Identifique causa raiz, consumidores e risco de regressão.
5. Prefira patch mínimo, reversível e backward-compatible.
6. Se não houver teste para comportamento crítico, crie characterization test antes da mudança quando viável.

## Proibições

Nunca executar automaticamente:
- `git reset --hard`;
- `git clean -fd`;
- force push;
- DROP destrutivo em produção;
- purge irreversível;
- rotação real de credencial;
- alteração massiva de dados de produção;
- restore em produção para “testar”;
- desativação de controles de segurança para fazer teste passar.

Para esses casos, prepare:
- mudança;
- pré-requisitos;
- backup;
- rollback/roll-forward;
- validação;
- passo manual.

## Ordem

1. P0
2. regressão dos P0
3. P1
4. regressão
5. P2
6. hardening P3 relevante
7. regressão completa

## Contrato por finding

Antes:
- ID;
- causa;
- evidência;
- impacto;
- arquivos/camadas;
- teste que deve falhar ou demonstrar a falha.

Depois:
- patch aplicado;
- teste criado/ajustado;
- resultado;
- regressão;
- risco residual.

Um finding só vira `CORRIGIDO` quando houver validação compatível com o tipo de falha.

## Falhas preexistentes

Se lint/build/test já falhava antes:
- não esconda;
- não faça mudanças não relacionadas só para deixar verde;
- registre como preexistente;
- prove que o patch não adicionou nova falha quando possível.
