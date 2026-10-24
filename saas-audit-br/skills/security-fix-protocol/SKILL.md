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
- desativação de controles de segurança para fazer teste passar;
- salto de **major** de dependência, `npm audit fix --force` ou troca de gerenciador de pacotes.

Para esses casos, prepare:
- mudança;
- pré-requisitos;
- backup;
- rollback/roll-forward;
- validação;
- passo manual.

## Dependências

- **Pode no `--fix`:** atualização dentro da faixa do `package.json` (patch/minor) e `overrides`/`pnpm.overrides`/`resolutions` para transitiva presa pelo pai, sempre com `deps-audit.mjs` antes e depois, instalação limpa com o lockfile (`npm ci` / `--frozen-lockfile`), build e testes.
- **Não pode:** major. Prepare o plano de migração da skill `saas-shield-br:dependency-audit` (motivo, breaking changes, pré-requisitos como Node, testes, rollback) e pergunte ao usuário: migrar agora, mitigar e agendar, ou aceitar o risco até uma data.
- **Triagem prod × dev:** P0/P1 só para dependência de produção ou ferramenta que roda no build/CI com segredos; ferramenta só local é P2. Use o audit de produção (`--omit=dev`/`--prod`/`--production`) para separar.
- Pacote abandonado com correção só no canal oficial (ex.: SheetJS pelo CDN) é troca de fonte: entra no plano com o hash do lockfile, não no `--fix`.

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
