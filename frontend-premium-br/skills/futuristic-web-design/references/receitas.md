# Receitas

Trechos de partida (React 19 + TypeScript). Adapte nomes e pastas ao projeto. Em Next.js App Router, todo arquivo daqui é client component (`'use client'`).

## 1. Hook de reduced-motion compartilhado

```tsx
import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true)
}
```

O valor do servidor é `true`: sem saber a preferência, o primeiro paint é estático.

## 2. Lenis + GSAP ScrollTrigger num provider só

```tsx
import { useEffect, type ReactNode } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const lenis = new Lenis({ lerp: 0.1 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [reduced])

  return children
}
```

Não use `scroll-behavior: smooth` no CSS junto. Importe `lenis/dist/lenis.css`.

## 3. Seção com pin e scrub (useGSAP)

```tsx
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function Capitulo() {
  const root = useRef<HTMLElement>(null)

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=150%', scrub: 0.6, pin: true },
      })
        .from('.titulo span', { yPercent: 110, stagger: 0.04, ease: 'power3.out' })
        .to('.visual', { scale: 1.15, ease: 'none' }, '<')
    })
    return () => mm.revert()
  }, { scope: root })

  return (
    <section ref={root} className="capitulo">
      <h2 className="titulo" aria-label="Velocidade sem ruído">
        {'Velocidade sem ruído'.split(' ').map((w, i) => (
          <span key={i} aria-hidden="true" className="inline-block">{w}&nbsp;</span>
        ))}
      </h2>
      <div className="visual" />
    </section>
  )
}
```

`gsap.matchMedia()` também serve para separar desktop e mobile (`'(min-width: 768px)'`).

## 4. Cena 3D carregada sob demanda, com fallback

```tsx
// Hero.tsx — o LCP é o texto; o 3D chega depois
import { lazy, Suspense } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { useInView } from './useInView' // IntersectionObserver simples

const Cena = lazy(() => import('./Cena'))

export function Hero() {
  const reduced = usePrefersReducedMotion()
  const [ref, visible] = useInView<HTMLDivElement>({ rootMargin: '200px' })
  const webgl = typeof window !== 'undefined' && !!document.createElement('canvas').getContext('webgl2')
  const saveData = typeof navigator !== 'undefined' && (navigator as any).connection?.saveData

  return (
    <header className="hero">
      <h1>…</h1>
      <div ref={ref} className="hero-visual" aria-hidden="true">
        {visible && webgl && !reduced && !saveData ? (
          <Suspense fallback={<img src="/hero-poster.avif" alt="" />}>
            <Cena />
          </Suspense>
        ) : (
          <img src="/hero-poster.avif" alt="" />
        )}
      </div>
    </header>
  )
}
```

Em Next.js: `const Cena = dynamic(() => import('./Cena'), { ssr: false })`.

```tsx
// Cena.tsx
import { Canvas } from '@react-three/fiber'
import { Environment, Float, PerformanceMonitor, AdaptiveDpr, useGLTF } from '@react-three/drei'
import { useState } from 'react'

function Produto() {
  const { scene } = useGLTF('/models/produto.glb') // Draco/Meshopt + KTX2
  return <primitive object={scene} />
}

export default function Cena() {
  const [dpr, setDpr] = useState(1.5)
  return (
    <Canvas dpr={[1, dpr]} camera={{ position: [0, 0, 4], fov: 40 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <AdaptiveDpr pixelated />
      <Float speed={1.2} rotationIntensity={0.3}><Produto /></Float>
      <Environment preset="city" />
    </Canvas>
  )
}
```

Comprima modelos com `npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2` (ferramenta de build, rode via npx na máquina, não vira dependência).

## 5. Efeito magnético acessível

```tsx
import { useRef } from 'react'

export function Magnetico({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current!
    const r = el.getBoundingClientRect()
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.25}px)`
  }
  const reset = () => { if (ref.current) ref.current.style.transform = '' }
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={reset}
      style={{ display: 'inline-block', transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1)' }}>
      {children}
    </span>
  )
}
```

Envolve o conteúdo visual; o `<a>`/`<button>` focável fica dentro e não se move com o teclado.

## 6. Shader simples com Drei

```tsx
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

const Onda = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#7cf') },
  /* glsl */ `varying vec2 vUv; uniform float uTime;
  void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*4.0+uTime)*0.08; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
  /* glsl */ `varying vec2 vUv; uniform vec3 uColor;
  void main(){ gl_FragColor = vec4(uColor * (0.6 + 0.4*vUv.y), 1.0); }`
)
extend({ Onda })

export function Plano() {
  const mat = useRef<any>(null)
  useFrame((_, dt) => { if (mat.current) mat.current.uTime += dt })
  return <mesh><planeGeometry args={[3, 2, 64, 64]} /><onda ref={mat} /></mesh>
}
```

Declare o tipo JSX de `onda` (`ThreeElements`) no projeto TypeScript.

## 7. Bloom só quando sobra orçamento

```tsx
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

export function Pos({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.8} />
      <Vignette darkness={0.4} />
    </EffectComposer>
  )
}
```

`enabled` vem do `PerformanceMonitor` e de `matchMedia('(min-width: 1024px)')`.
