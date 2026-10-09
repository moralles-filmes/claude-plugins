---
description: Inicia construção de SaaS novo. Aciona o arquiteto-chefe com o conceito do projeto e arranca a Fase 1 (concept → spec).
---

Você vai chamar o subagent `arquiteto-chefe` com o conceito que o usuário forneceu.

**Conceito recebido**: $ARGUMENTS

Sua única ação: invoque o subagent `arquiteto-chefe` via Agent tool com este prompt:

```
Tarefa: Iniciar Fase 1 (concept) para um novo SaaS.

Conceito do usuário: <colar $ARGUMENTS aqui>

Stack assumida (se o usuário não disser o contrário):
- Vite + React + TypeScript + Tailwind
- Supabase (DB + Auth + Edge Functions + Storage)
- Vercel deploy
- Multi-tenant: arquétipo E do Padrão SaaS (empresa → filial, usuário em várias empresas, permissões <modulo>.<submodulo>.<acao>, módulos contratados, empresa ativa na URL /app/:empresa). A–D só se o repo já tiver um .claude/tenancy-profile.yml que declare outro arquétipo (projeto existente)
- Padrão SaaS: se o repo não tem docs/standards/, peça /padrao-saas:aplicar (modo B) antes da Fase 1
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
