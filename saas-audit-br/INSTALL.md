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
/saas-audit-br:audit --audit-only
```

O primeiro comando não deve modificar o projeto.
O segundo deve iniciar baseline e criar o estado operacional `.saas-audit/`.
