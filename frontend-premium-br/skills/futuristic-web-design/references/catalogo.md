# Catálogo de bibliotecas

Versões conferidas no npm em **2026-11-06**. Antes de instalar, confira a versão atual e os `peerDependencies` (`npm view <pacote> version peerDependencies`) e prefira uma versão publicada há pelo menos 14 dias. Instale **por projeto**, nunca global, com versão exata e o lockfile do projeto.

| # | Biblioteca | Pacote(s) | Versão ref. | Licença | Docs oficiais |
|---|---|---|---|---|---|
| 1 | React Bits | — (código copiado via shadcn/jsrepo) | registro `reactbits.dev/r/{name}.json` | MIT + Commons Clause | https://reactbits.dev · https://github.com/DavidHDev/react-bits |
| 2 | Three.js | `three` | 0.187.0 | MIT | https://threejs.org/docs · https://github.com/mrdoob/three.js |
| 3 | React Three Fiber | `@react-three/fiber` | 9.8.2 | MIT | https://r3f.docs.pmnd.rs · https://github.com/pmndrs/react-three-fiber |
| 4 | Drei | `@react-three/drei` | 10.7.9 | MIT | https://drei.docs.pmnd.rs · https://github.com/pmndrs/drei |
| 5 | GSAP | `gsap`, `@gsap/react` | 3.15.1 / 2.1.2 | GSAP Standard License (grátis, inclusive plugins; ler termos) | https://gsap.com/docs/v3 · https://github.com/greensock/GSAP |
| 6 | Lenis | `lenis` | 1.3.27 | MIT | https://lenis.darkroom.engineering · https://github.com/darkroomengineering/lenis |
| 7 | Magic UI | — (código copiado via shadcn; MCP `magicui`) | registro `magicui.design/r/{name}.json` | MIT | https://magicui.design/docs · https://github.com/magicuidesign/magicui |
| 8 | Motion Primitives | — (código copiado) + `motion` | motion 14.10.1 | MIT | https://motion-primitives.com · https://github.com/ibelick/motion-primitives |
| 9 | R3F Scroll Rig | `@14islands/r3f-scroll-rig` | 8.15.0 | MIT | https://github.com/14islands/r3f-scroll-rig |
| 10 | React Postprocessing | `@react-three/postprocessing`, `postprocessing` | 3.2.2 / 6.39.6 | MIT / Zlib | https://react-postprocessing.docs.pmnd.rs · https://github.com/pmndrs/react-postprocessing |

## Compatibilidade (peers em 2026-11-06)

- `@react-three/fiber` 9.x pede **React ≥ 19 e < 19.4** e `three ≥ 0.156`. Em React 18, use fiber 8 + drei 9. Confira a versão de React do projeto antes.
- `@react-three/drei` 10 pede fiber 9 e React 19.
- `@react-three/postprocessing` 3.2 pede fiber ≥ 9.7 e `postprocessing ^6.36`; `postprocessing` 6.39 pede `three ≥ 0.168 e < 0.188`. Alinhe as três versões juntas.
- `@14islands/r3f-scroll-rig` 8.15.0 é de **dez/2024** (repositório ativo até dez/2025). Peers aceitam fiber 9, mas teste antes; se travar, use um `<Canvas>` fixo + `View` do Drei e ScrollTrigger.
- `motion` (ex-Framer Motion): importe de `motion/react`. Não instale `framer-motion` junto.
- Lenis: o pacote é `lenis` (os antigos `@studio-freight/lenis`/`@studio-freight/react-lenis` estão descontinuados). Em React: `lenis/react`.

## Quando usar cada uma

1. **React Bits** — textos animados (SplitText, BlurText, DecryptedText), fundos (Aurora, Particles, Silk, Threads), cartões e cursores. Sabores pelo sufixo: `-TS-TW` (TypeScript + Tailwind), `-TS-CSS`, `-JS-TW`, `-JS-CSS`. Alguns componentes trazem `three`, `ogl` ou `gsap` como dependência: leia o JSON do item antes. Commons Clause: pode usar em produto, não pode revender os componentes como produto.
2. **Three.js** — base de tudo em 3D. Use direto só fora de React ou para utilitários (`THREE.MathUtils`, loaders).
3. **React Three Fiber** — 3D declarativo em React. Um `<Canvas>` por página; animação em `useFrame` mutando refs, nunca `setState` por frame.
4. **Drei** — `Environment`, `useGLTF`, `Float`, `MeshTransmissionMaterial`, `ScrollControls`, `View`, `PerformanceMonitor`, `AdaptiveDpr`, `Preload`, `shaderMaterial`. Importe por nome (tree-shaking).
5. **GSAP** — timelines e ScrollTrigger (pin, scrub, snap), SplitText (texto). Em React, sempre `useGSAP` com `scope`, que limpa no unmount. Registre plugins uma vez (`gsap.registerPlugin(ScrollTrigger, useGSAP)`).
6. **Lenis** — smooth scroll leve. Ligue ao ticker do GSAP (`lenis.on('scroll', ScrollTrigger.update)`; `gsap.ticker.add(t => lenis.raf(t * 1000))`; `gsap.ticker.lagSmoothing(0)`). Desligue com reduced-motion.
7. **Magic UI** — componentes de marketing prontos (marquee, bento grid, número animado, globo, beams). Busque pelo MCP `magicui`; instale via `npx shadcn@<versão> add "https://magicui.design/r/<nome>.json"`.
8. **Motion Primitives** — primitivas com Motion (TextEffect, InView, AnimatedGroup, Dialog morph). `npx shadcn@<versão> add "https://motion-primitives.com/c/<nome>.json"`. Use se o projeto já usa `motion`.
9. **R3F Scroll Rig** — WebGL sincronizado com elementos do DOM (imagem que vira plano 3D no scroll, `ScrollScene`, `ViewportScrollScene`). Bom para galerias editoriais; ver alerta de manutenção acima.
10. **React Postprocessing** — `EffectComposer` com Bloom, DepthOfField, Noise, Vignette, ChromaticAberration. Custo alto de GPU: desligue no mobile/`PerformanceMonitor` em queda.

## Skills relacionadas (se instaladas)

- `web-animation-design` (este plugin) — curvas, durações, springs, reduced-motion de UI.
- `frontend-design` (claude-plugins-official) — direção estética geral.
- `vercel-react-view-transitions`, `web-design-guidelines`, `vercel-composition-patterns`, `vercel-react-best-practices` (vercel-labs/agent-skills, escopo pessoal) — ver README do plugin.
- `turbo:frontend-perf` — quando houver lentidão medida.
