---
name: futuristic-web-design
description: "Direção de arte e implementação de sites premium, futuristas, 3D e cinematográficos — WebGL/Three.js/React Three Fiber, scroll storytelling com GSAP ScrollTrigger e Lenis, parallax, transições entre seções, tipografia cinética, shaders, partículas, iluminação, objetos 3D interativos, efeitos magnéticos e microinterações, com orçamento de performance mobile, reduced-motion e acessibilidade. Use quando o pedido pedir explicitamente esse estilo: site/landing page premium, futurista, imersivo, 3D, WebGL, cinematográfico, animação de scroll, hero 3D, 'efeito uau', estilo Awwwards; ou quando o usuário chamar /frontend-premium-br:futuristic-web-design. NÃO use em telas operacionais de SaaS (dashboard, CRUD, formulários, tabelas) nem em projeto que não pediu esse estilo — aí vale o design-ux do saas-builder-br ou o frontend-design."
---

# Futuristic Web Design

Sites que parecem dirigidos, não montados. A experiência tem uma ideia visual, um ritmo e um motivo para cada movimento, e ainda carrega rápido num celular médio em 4G.

## 0. Antes de começar: onde isto pode entrar

**Escopo.** Esta skill vale para superfícies de marketing: site institucional, landing page, página de produto, portfólio, campanha, onboarding de primeira visita. **Não** vale para as telas operacionais de um SaaS (o app autenticado: listas, cadastros, financeiro, configurações). Lá a regra é a do `web-animation-design`: 100–300 ms, `ease-out`, nada que o usuário veja 100 vezes por dia, e o design system do `design-ux` (saas-builder-br).

**Não imponha estilo.** Se o pedido não fala em futurista, 3D, imersivo, cinematográfico ou equivalente, não traga 3D, partículas nem scroll sequestrado. Pergunte, ou entregue o estilo pedido.

**Projeto com o Padrão SaaS** (existe `docs/standards/` ou `AGENTS.md` do padrão):
- Leia `AGENTS.md` e, conforme a tarefa, `docs/standards/ARCHITECTURE.md` §11 (dependências) e `PERFORMANCE.md` §4 (frontend). O padrão do projeto vence esta skill.
- Toda biblioteca nova (three, R3F, GSAP, Lenis, motion, postprocessing) é decisão registrada: uma linha de justificativa no plano e, se for N2+, ADR em `docs/adr/` a partir de `_TEMPLATE.md`. Instale com o gerenciador e o lockfile que o projeto já usa, com versão exata, nunca `@latest` em `package.json`.
- O código de efeito visual não chama Supabase, não importa o cliente de dados nem lê segredo. Dado da tela continua vindo do adapter `src/features/<modulo>/api.ts` (portabilidade).
- Mudança que mexe em várias camadas → `padrao-saas:mudanca`. Lentidão medida → `turbo`.

**Projeto sem o padrão:** siga as convenções que o repositório já tem e as mesmas regras de dependência.

## 1. Fluxo

1. **Briefing em 5 respostas** (pergunte só o que não deu para inferir): público e objetivo da página; 3 adjetivos da marca; referência visual que o usuário gosta (e o que *não* quer); conteúdo real disponível (texto, logo, modelo 3D, fotos); alvo de dispositivo (tráfego mobile?).
2. **Conceito.** Uma frase de direção de arte + paleta (tokens) + par tipográfico + a "ideia 3D/motion" central. Uma só ideia forte; o resto apoia. Apresente antes de codar quando a decisão for do usuário.
3. **Storyboard de seções.** Para cada seção: mensagem, o que se move, gatilho (load, scroll, hover, pointer), duração/curva, versão reduced-motion e versão mobile.
4. **Stack mínima.** Escolha pela tabela da §3. Cada biblioteca precisa justificar seu peso.
5. **Implementação em camadas:** HTML semântico e conteúdo legível sem JS → layout responsivo e tipografia → motion de UI (CSS/Motion) → scroll (GSAP+Lenis) → 3D carregado sob demanda → pós-processamento por último, se o orçamento sobrar.
6. **Verificação** da §6 antes de dizer que terminou.

## 2. Direção de arte que não parece template

- **Evite o kit genérico:** gradiente roxo-azul em fundo preto, glassmorphism em tudo, Inter como única fonte, blob 3D aleatório no hero, 12 efeitos diferentes na mesma página.
- **Tipografia é o primeiro efeito.** Display com personalidade (variável, se possível) + texto de leitura neutro. Escala com contraste forte (ex.: hero 9–14vw com `clamp()`), entrelinha apertada no display, generosa no corpo.
- **Paleta com papéis**, em tokens CSS (`--bg`, `--fg`, `--accent`, `--glow`), checada em contraste WCAG AA para texto. Luz e brilho são acento, não fundo.
- **Um sistema de movimento.** Defina 2–3 curvas e 3 durações como tokens e reutilize. Coerência vale mais que variedade.
- **3D com propósito:** o objeto conta a história do produto (o produto em si, uma metáfora clara, dados), reage ao usuário e tem iluminação pensada (key/rim light ou HDRI de `Environment`), não um torus girando.
- **Ritmo:** alterne seções densas e de respiro. Nem toda seção anima.

## 3. Escolha da biblioteca (use a mais leve que resolve)

| Necessidade | Primeira escolha | Quando subir de nível |
|---|---|---|
| Hover, entrada, microinteração | CSS (`transition`, `@keyframes`, `@starting-style`) | Motion (`motion/react`) para gesto, layout animation, exit |
| Componente animado pronto (texto, fundo, cartão) | React Bits ou Magic UI via MCP shadcn/magicui | Motion Primitives se o projeto já usa Motion |
| Scroll storytelling, pin, scrub, timeline | GSAP + ScrollTrigger (`@gsap/react` `useGSAP`) | — |
| Rolagem suave | Lenis (sincronizado com o ticker do GSAP) | Nunca em app operacional; respeite reduced-motion |
| Transição entre páginas/estados | View Transitions API (skill `vercel-react-view-transitions`, se instalada) | Motion `AnimatePresence` |
| Cena 3D | React Three Fiber + Drei | Three.js puro só fora de React |
| 3D atrelado a elementos do DOM durante o scroll | R3F Scroll Rig (ver alerta de manutenção no catálogo) | Canvas fixo + `View` do Drei |
| Bloom, profundidade, ruído, aberração | React Postprocessing | Só com orçamento sobrando e desligado no mobile fraco |
| Shader próprio | `shaderMaterial` do Drei + GLSL | — |

**Conflitos a evitar:** dois sistemas controlando a mesma propriedade (GSAP e Motion no mesmo elemento), dois smooth scrolls, `scroll-behavior: smooth` junto com Lenis, ScrollTrigger sem `ScrollTrigger.refresh()` depois de fonte/imagem carregar, mais de um `<Canvas>` WebGL na página (use um Canvas + `View`/scissor).

Detalhes, versões e links oficiais: [references/catalogo.md](references/catalogo.md). Trechos prontos: [references/receitas.md](references/receitas.md).

## 4. Orçamento de performance (não negociável)

Meça; não estime. Alvos num celular médio (Moto G / Galaxy A, 4G, CPU 4× mais lenta no DevTools):

- **LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1.** O LCP é texto ou imagem do HTML, nunca o Canvas.
- **JS inicial da rota ≤ ~170 KB gzip.** Three/R3F/postprocessing entram em chunk separado (`React.lazy`/`next/dynamic` com `ssr:false`), carregados depois do primeiro paint ou ao entrar na viewport.
- **3D:** modelo GLB com Draco/Meshopt e texturas KTX2, < 1–2 MB no total; `dpr={[1, 1.5]}` (≤ 2 no desktop), `PerformanceMonitor` do Drei para degradar, `frameloop="demand"` quando a cena é estática, pausar render fora da viewport e com a aba oculta.
- **Animação:** só `transform` e `opacity` no DOM; `will-change` pontual e removido depois; nada de `filter: blur` grande animado.
- **Mobile fraco / `saveData` / sem WebGL:** fallback estático (imagem/vídeo poster) com o mesmo conteúdo.

Checklist completo e como medir: [references/orcamento-e-a11y.md](references/orcamento-e-a11y.md).

## 5. Acessibilidade e reduced-motion

- `prefers-reduced-motion: reduce` → sem parallax, sem scroll suave, sem scrub; troque por fade curto ou estado final. 3D vira imagem estática ou cena parada.
- Todo conteúdo existe no DOM como texto real (o texto animado com split mantém `aria-label` com a frase inteira e os pedaços em `aria-hidden`).
- Canvas decorativo: `aria-hidden="true"`. Canvas que transmite informação: descrição textual equivalente.
- Teclado: tudo que reage a hover reage a foco; efeito magnético não move o alvo de foco; nada de scroll sequestrado que impeça Tab/PageDown.
- Nada piscando mais de 3 vezes por segundo. Vídeo e animação longa com controle de pausa.
- Contraste AA sobre fundos animados (teste no pior quadro).

## 6. Pronto quando

- [ ] Funciona e é legível com JS desligado e com reduced-motion ligado.
- [ ] Lighthouse mobile e Web Vitals medidos e dentro do orçamento (anexe números, não "deve estar ok").
- [ ] Testado em 375 px, 768 px e desktop; toque não depende de hover.
- [ ] Sem erro no console; sem vazamento ao navegar (contexts WebGL, ScrollTriggers e listeners limpos no unmount).
- [ ] Nenhuma dependência sobrando; versões exatas no lockfile; justificativa/ADR registrada se o projeto usa o padrão.
- [ ] Componentes copiados de React Bits/Magic UI revisados como código de terceiro (sem fetch externo inesperado, sem `dangerouslySetInnerHTML` com dado do usuário).
- [ ] `web-design-guidelines` (se instalada) passada nos arquivos alterados.

## 7. MCPs deste plugin

- **magicui** — `listRegistryItems`, `searchRegistryItems`, `getRegistryItem`: busca componentes Magic UI e traz o comando de instalação.
- **shadcn** — navega, busca e instala itens de registros shadcn, inclusive React Bits (`@react-bits/<Nome>-TS-TW`). Precisa de `components.json` no projeto; para React Bits, o registro em `registries`. Passo a passo: [references/react-bits-shadcn.md](references/react-bits-shadcn.md).

Instalar componente escreve arquivos no projeto: mostre o que será adicionado antes, num projeto real.
