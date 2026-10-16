---
name: novo-saas
description: "Inicia construção de SaaS novo. Aciona o arquiteto-chefe com o conceito do projeto e arranca a Fase 1 (concept → spec). Use quando o usuário pedir (equivale ao comando /novo-saas do Claude Code)."
---
`<argumentos>` = o que o usuário pediu junto com a skill.

Você vai chamar o subagent `arquiteto-chefe` com o conceito que o usuário forneceu.

**Conceito recebido**: <argumentos>

Sua única ação: invoque o subagent `arquiteto-chefe` via Agent tool com este prompt:

```
Tarefa: Iniciar Fase 1 (concept) para um novo SaaS.

Conceito do usuário: <colar <argumentos> aqui>

Stack assumida (se o usuário não disser o contrário):
- Vite + React + TypeScript + Tailwind
- Supabase (DB + Auth + Edge Functions + Storage)
- Vercel deploy
- Multi-tenant: arquétipo E do Padrão SaaS (empresa → filial, usuário em várias empresas, permissões <modulo>.<submodulo>.<acao>, módulos contratados, empresa ativa na URL /app/:empresa). A–D só se o repo já tiver um .claude/tenancy-profile.yml que declare outro arquétipo (projeto existente)
- Padrão SaaS: se o repo não tem docs/standards/, peça $padrao-saas:aplicar (modo B) antes da Fase 1
- Idioma UI: PT-BR

Ações esperadas:
1. Cria/atualiza .claude/saas-state.json com phase="concept" e o conceito
2. Delega para arquiteto-saas gerar .claude/spec/projeto.md
3. Devolve resumo curto ao usuário com:
   - Spec gerada
   - Decisões pendentes (se houver)
   - Próxima fase proposta
```

Após o subagent retornar, repasse o resumo dele ao usuário e pergunte se pode avançar para a Fase 2 (schema).

## Nota para o Codex

Gerado de `saas-builder-br/` (plugin Claude Code) por `scripts/build-codex-plugins.mjs`. `<plugin-root>` é a pasta que contém `.codex-plugin/`, dois níveis acima deste `SKILL.md`. Onde o texto manda acionar um agente ou subagente (Agent tool, `subagent_type`), use a skill de mesmo nome deste plugin (`$saas-builder-br:<nome>`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um `/comando` do Claude Code é a skill `$<plugin>:<comando>`.
