# Instalação

Este plugin foi projetado para o marketplace:

`moralles-filmes/claude-plugins`

## Pré-requisitos

Instale no Claude Code:

```bash
claude plugin install saas-shield-br
claude plugin install code-health
```

Depois:

```bash
claude plugin install saas-audit-br
```

## Validação no repositório do marketplace

Depois de adicionar a pasta do plugin e registrar no `.claude-plugin/marketplace.json`:

```bash
node scripts/validate.mjs
```

O push só deve ocorrer se a validação passar.

## Teste rápido

Em um projeto SaaS:

```text
/saas-audit-br:status
/saas-audit-br:audit
```

O primeiro comando não deve modificar o projeto.
O segundo roda em `--audit-only` (o padrão): inicia a baseline, cria o estado operacional `.saas-audit/` e não edita código. Para corrigir, rode `/saas-audit-br:audit --fix` explicitamente.
