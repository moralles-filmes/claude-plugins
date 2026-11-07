# Orçamento de performance e acessibilidade

## Como medir

1. Build de produção (`npm run build` + `preview`/`start`), nunca o dev server.
2. Chrome DevTools → Performance: CPU 4× slowdown, rede "Fast 4G". Grave load + scroll pela página inteira. Procure long tasks > 50 ms e quadros > 16,7 ms.
3. Lighthouse mobile (3 execuções, use a mediana). Anote LCP, TBT, CLS e o peso de JS.
4. Tamanho por rota: `npx vite-bundle-visualizer` (Vite) ou `ANALYZE=true` com `@next/bundle-analyzer` (Next). Confirme que `three` e companhia estão num chunk separado.
5. Em celular real, se houver: abrir pelo IP da rede local e rolar a página inteira.

Se o projeto usa o `turbo`, grave a linha de base em `.turbo/` e use `turbo:perf-guardrails` para travar o orçamento no CI.

## Orçamento

| Métrica | Alvo mobile | Observação |
|---|---|---|
| LCP | ≤ 2,5 s | elemento LCP é texto ou `<img>` com `fetchpriority="high"` |
| INP | ≤ 200 ms | nada de trabalho pesado no handler de pointer/scroll |
| CLS | ≤ 0,1 | reserve o espaço do Canvas e das fontes (`size-adjust`, `font-display: swap`) |
| JS inicial da rota | ≤ ~170 KB gzip | 3D e pós-processamento fora do chunk inicial |
| Modelos + texturas 3D | ≤ 1–2 MB | Draco/Meshopt + KTX2; uma HDRI pequena (≤ 1k) ou `preset` |
| FPS durante scroll | ≥ 50 no mobile médio | caiu? reduzir DPR, desligar pós, simplificar shader |
| Draw calls | < 100 | instancing (`<Instances>`), merge de geometria |

## Higiene WebGL

- Um `<Canvas>` por página; seções diferentes com `View` do Drei.
- `frameloop="demand"` + `invalidate()` em cena parada; pausar quando fora da viewport (`IntersectionObserver`) e com `document.hidden`.
- Liberar recursos ao desmontar (R3F libera o que criou; o que você criou com `new` em código imperativo, você chama `.dispose()`).
- Partículas: `Points`/instancing com buffer fixo; nada de criar objetos por frame.
- Texturas em potência de 2 quando possível; `anisotropy` só onde aparece.

## Fallbacks obrigatórios

| Situação | Comportamento |
|---|---|
| `prefers-reduced-motion: reduce` | estado final estático; sem Lenis, sem parallax, sem scrub; 3D vira imagem |
| Sem WebGL2 / contexto perdido | imagem poster com o mesmo enquadramento |
| `navigator.connection.saveData` ou rede 2G/3G lenta | sem 3D, sem vídeo autoplay |
| Toque (sem hover fino) | efeitos de hover desligados (`@media (hover: hover) and (pointer: fine)`) |
| JS desligado ou falhou | conteúdo completo legível, links funcionando |

## Checklist de acessibilidade

- [ ] Hierarquia de títulos correta; landmarks (`header`, `main`, `nav`, `footer`).
- [ ] Texto partido para animação: frase inteira em `aria-label`, pedaços em `aria-hidden`.
- [ ] Canvas decorativo com `aria-hidden="true"`; informativo com descrição textual.
- [ ] Foco visível em todos os interativos; ordem de Tab segue a leitura; nenhum pin do ScrollTrigger prende o foco fora da tela.
- [ ] Contraste AA (4,5:1 texto, 3:1 texto grande/ícones) sobre o pior quadro do fundo animado.
- [ ] Nada pisca > 3 vezes/s; animação > 5 s em loop tem pausa.
- [ ] Alvos de toque ≥ 44 × 44 px.
- [ ] Zoom 200% sem quebrar layout; `vw` no display sempre dentro de `clamp()` com mínimo em `rem`.
- [ ] Idioma da página (`lang="pt-BR"`) e textos alternativos em PT-BR.

## Segurança e compatibilidade (Padrão SaaS)

- Código copiado de registro (React Bits, Magic UI, Motion Primitives) é código de terceiro: leia antes de commitar, procure `fetch`/`import()` remoto, `eval`, `innerHTML`.
- Modelos, HDRIs e fontes servidos do próprio domínio ou CDN do projeto; nada de hotlink em domínio de terceiro. Se o projeto tem CSP, inclua `worker-src blob:` só se algum loader (Draco/KTX2) exigir, e documente.
- Nenhuma animação depende de dado de tenant nem roda dentro de páginas autenticadas pesadas.
- Navegadores-alvo: últimas 2 versões de Chrome, Safari (iOS incluso), Firefox e Edge. Teste Safari iOS: é onde WebGL e `backdrop-filter` mais falham.
