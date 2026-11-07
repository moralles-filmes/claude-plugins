# Precedência entre plugins de desenvolvimento

Vários plugins querem conduzir o mesmo pedido (hooks do superpowers e do ai-router-br, arquiteto-chefe do saas-builder-br). Quando mais de um se aplicar, siga esta ordem:

1. **SaaS do zero** ("quero construir um SaaS", "novo projeto") → `saas-builder-br` (`/novo-saas`, agente `arquiteto-chefe`). Ele conduz as fases; não abra brainstorming ou plano paralelo do superpowers para o mesmo escopo.
2. **Feature, módulo ou refactor em projeto existente** → `superpowers:brainstorming` quando houver decisão de design em aberto, depois `superpowers:writing-plans`.
3. **Execução** → para cada tarefa substancial (do plano ou pedida direto), `ai-router-br:route` decide o executor. O que ficar com o Claude (`executor: main`) pode seguir `superpowers:subagent-driven-development`; o que for despachado para Codex/DeepSeek não é reimplementado por subagente — só revisado.
4. **Auditoria** → módulo: skill `saas-audit-br:module`; sistema inteiro ou release: `/saas-audit-br:audit` (manual, peça ao usuário). Os gates pontuais do `saas-shield-br` (RLS, secrets, tenant) continuam valendo dentro de cada fase.
5. **Performance** (lentidão, query lenta, re-render, bundle) → plugin `turbo`. **Custo de infra** (fatura Supabase/Vercel) → `saas-shield-br:cost-optimizer`.
6. **Visual** → telas do app SaaS: agente `design-ux` (saas-builder-br) + `web-animation-design`. Site, landing ou página pedida como premium, 3D, imersiva ou cinematográfica: `frontend-premium-br:futuristic-web-design`. Revisão de UI: `web-design-guidelines`. Em cada caso, `frontend-design` dá a direção estética.

Pedidos pequenos e triviais: faça direto, sem acionar nenhum desses fluxos.

# Frontend

- Ao criar ou alterar interface, considere as skills de frontend e os MCPs `magicui` e `shadcn` (do `frontend-premium-br`) antes de escrever componente do zero.
- Não imponha estilo futurista, 3D ou scroll cinematográfico a projeto que não pediu.
- Escolha a biblioteca mais leve que resolve. Dependência de execução (three, R3F, GSAP, Lenis, motion…) é instalada por projeto, com versão exata e o lockfile do projeto, nunca global, e só quando o projeto usa.
- Uma biblioteca por papel: não misture dois sistemas de animação na mesma propriedade nem dois smooth scrolls.
- Meça desempenho real em mobile e desktop. Respeite acessibilidade, `prefers-reduced-motion` e navegadores-alvo.
- Preserve a arquitetura, as regras de segurança e as funcionalidades do projeto. Onde houver Padrão SaaS, o `AGENTS.md` e o `docs/standards/` do projeto vencem estas regras.
