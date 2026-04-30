---
name: functional-audit
description: Auditoria funcional completa do projeto JS/TS/React/Next.js — encontra botões fantasma (sem handler ou só com console.log), rotas quebradas, dados mockados em produção, stubs/funções não implementadas, código comentado, TODOs antigos e tudo que está "decorativo" mas não funcional. Use quando o usuário pedir "encontre bugs", "ache botões que não funcionam", "remova dados fake", "mocked data", "stubs", "rotas quebradas", "find non-functional", "tudo que não está funcional", "quero que o sistema esteja pronto para operação real". Modo padrão: report-first com severidade (BLOCKER/HIGH/MEDIUM/LOW) e fix item-a-item após aprovação.
---

# Functional Audit

Você está auditando o projeto procurando o oposto de "código morto": código que **existe mas não funciona**, ou que **finge funcionar** mas tem dados fake/stubs/mocks por baixo. Foco: **JS/TS/React/Next.js** prontos para produção real.

## Filosofia: "isto está pronto para receber um usuário real?"

Em cada finding, faça a pergunta: **"Se um usuário clicar/navegar/usar isto agora, o que acontece?"**
- Acontece o que ele espera → ✅ funcional
- Acontece nada → 🔴 BLOCKER (botão fantasma)
- Acontece um erro → 🔴 BLOCKER (rota quebrada, função não implementada)
- Acontece algo, mas com dados falsos → 🟠 HIGH (mock em produção)
- Acontece, mas pode ser melhor → 🟡 MEDIUM (TODO, código comentado)

## Quando usar

Ative quando o usuário usar frases como:
- "encontre os bugs", "ache o que não está funcional", "auditoria do que não funciona"
- "botões que não fazem nada", "rotas que dão 404", "funções não implementadas"
- "remova os dados mockados", "tem dado fake na aplicação"
- "deixa o sistema pronto pra operação real", "quero subir pra produção"
- "find broken buttons", "fix mocked data", "find stub functions", "make functional"
- "varredura de bugs"

Não ative quando:
- O usuário quer remover código não usado (use `dead-code-cleanup`)
- O usuário descreve um bug específico (atue diretamente, não use auditoria geral)
- O usuário quer só revisar um PR (use code-review)

## Workflow (5 fases)

### Fase 1 — Mapa funcional do projeto

Antes de procurar problemas, entenda o que deveria funcionar:

```bash
# Mapear rotas (App Router)
find app -type f \( -name 'page.tsx' -o -name 'page.ts' -o -name 'page.jsx' -o -name 'page.js' \) 2>/dev/null

# Mapear rotas (Pages Router)
find pages -type f -not -path '*/api/*' \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' \) 2>/dev/null

# Mapear endpoints da API
find app -type f -name 'route.*' 2>/dev/null
find pages/api -type f 2>/dev/null

# Mapear actions (Server Actions)
rg -l "^['\"]use server['\"]" --glob '!node_modules' --glob '!.next'

# Identificar formulários
rg -l '<form' --glob '*.{tsx,jsx}' --glob '!node_modules'
```

Anote: quantas rotas, quantos endpoints, quantos forms, quantos componentes interativos. Esse é seu universo de auditoria.

### Fase 2 — Varredura paralela (use o subagent functional-auditor)

Delegue ao subagent `functional-auditor`. Ele roda 7 detectores em paralelo. Cada detector busca um padrão específico e retorna findings com `file:line` + categoria + severidade.

| # | Detector | Severidade base | O que procura |
|---|---|---|---|
| 1 | Phantom buttons | 🔴 BLOCKER | Botões/links sem handler, com handler vazio, ou só console.log |
| 2 | Broken routes | 🔴 BLOCKER | `<Link href="/x">` sem `app/x/page.*` correspondente; `router.push("/y")` para rota inexistente; fetch para endpoint não existente |
| 3 | Mocked data | 🟠 HIGH | Arrays/objetos hardcoded com aparência de dados reais; lorem ipsum; nomes/emails fake (`john@example.com`, `Test User`, `Lorem`) |
| 4 | Stub functions | 🔴 BLOCKER (se chamada) ou 🟡 MEDIUM (se órfã) | `return null`, `return Promise.resolve()`, `throw new Error('Not implemented')`, `// TODO: implement` |
| 5 | Empty handlers | 🟠 HIGH | `try { ... } catch {}`, `.catch(() => {})`, `onError: () => {}` |
| 6 | TODOs/FIXMEs | 🟡 MEDIUM ou 🟠 HIGH (se >6 meses) | TODO, FIXME, XXX, HACK, @deprecated |
| 7 | Commented-out code | 🟡 MEDIUM | Blocos de código comentados `//` ou `/* */` com mais de 5 linhas |

### Fase 3 — Severidade contextual

A severidade base sobe ou desce dependendo do contexto:

**Sobe para BLOCKER** quando o finding está em:
- Rota pública (rota sem auth check)
- Página de checkout / pagamento / signup / login
- Endpoint de API
- Componente em `app/`, `pages/` (vs componente em `components/_internal/`)
- Server Action

**Desce para LOW** quando:
- Arquivo está em `__tests__/`, `*.test.*`, `*.spec.*`, `*.stories.*`
- Arquivo está em `examples/`, `playground/`, `sandbox/`
- Componente é claramente uma demo (`<DemoButton/>`, `<ExampleForm/>`)

### Fase 4 — Apresentação do relatório

Salve em `./code-health-reports/functional-audit-YYYY-MM-DD-HHMM.md`. Estrutura:

```markdown
# Functional Audit — <data>

## Resumo executivo
- 🔴 BLOCKER: 12 itens — projeto não está pronto para produção
- 🟠 HIGH: 23 itens — funciona mas com dados/comportamento fake
- 🟡 MEDIUM: 34 itens — débito técnico relevante
- 🟢 LOW: 56 itens — limpeza opcional

**Veredito:** ❌ NOT-PRODUCTION-READY (12 blockers)

## 🔴 BLOCKER — corrigir antes de qualquer deploy

### Phantom buttons (4)

#### 1. `app/dashboard/settings/page.tsx:87`
```tsx
<button onClick={() => console.log("save")} className="...">
  Salvar configurações
</button>
```
**Problema:** botão "Salvar configurações" só loga, não persiste nada.
**Fix sugerido:** implementar Server Action `saveSettings` que escreve no DB. Se ainda não tem schema, marcar como TODO e desabilitar o botão visualmente (`disabled` + tooltip "Em breve").
**Confiança do fix:** 🟡 média (depende de saber qual DB/ORM o projeto usa).

#### 2. ...

### Broken routes (3)

#### 1. `components/Nav.tsx:23`
```tsx
<Link href="/billing">Cobrança</Link>
```
**Problema:** `/billing` não tem `app/billing/page.tsx`. Clicar dá 404.
**Fix sugerido:** ou (a) criar `app/billing/page.tsx` com placeholder funcional + nota "em construção", ou (b) remover o link da navegação.
**Confiança do fix:** 🟢 alta (a remoção é trivial; a criação depende do escopo).

#### 2. ...

### Stub functions chamadas em produção (5)

#### 1. `lib/payments.ts:14`
```ts
export async function processPayment(orderId: string) {
  // TODO: integrar com Stripe
  return Promise.resolve({ success: true });
}
```
**Chamada em:** `app/checkout/page.tsx:45`, `app/api/orders/route.ts:78`
**Problema:** finge processar pagamento — retorna sucesso sem cobrar nada.
**Fix sugerido:** essa é uma decisão de produto, não posso resolver sozinho. Opções: (1) integrar Stripe (precisa de API keys + webhook); (2) desabilitar checkout até estar pronto; (3) modo sandbox com Stripe test keys.
**Confiança do fix:** 🔴 baixa — requer decisão humana.

## 🟠 HIGH — dados/comportamento fake

### Mocked data em rotas reais (8)

#### 1. `app/products/page.tsx:12`
```tsx
const PRODUCTS = [
  { id: 1, name: "Sample Product 1", price: 99.99 },
  { id: 2, name: "Sample Product 2", price: 149.99 },
  { id: 3, name: "Lorem Ipsum", price: 199.99 },
];
```
**Problema:** página `/products` mostra produtos hardcoded com lorem ipsum.
**Fix sugerido:** substituir por fetch ao DB / API. Se não há fonte real ainda, mover constante para `mocks/products.ts` e adicionar comentário `// FIXTURE — replace with DB query`.
**Confiança do fix:** 🟡 média.

### Empty error handlers (15)

...

## 🟡 MEDIUM

### TODOs antigos (>6 meses) (12)
| Arquivo:linha | Idade | Comentário |
|---|---|---|
| `lib/auth.ts:45` | 14 meses | `// TODO: refresh tokens` |
...

### Código comentado (22)
...

## Plano de execução proposto

### Sprint 0: Quebra-galho (1-2 horas)
- Desabilitar visualmente os 4 phantom buttons
- Remover os 3 broken routes da navegação (ou criar placeholders)
- Adicionar guard nos 5 stubs chamados em produção (ex: feature flag `STRIPE_ENABLED=false` mostra "em breve")

### Sprint 1: Dados reais (1 semana)
- Substituir 8 mocked datasets por fetches reais
- Implementar 5 stubs identificados como BLOCKER

### Sprint 2: Polimento
- 15 empty error handlers → adicionar logging real (Sentry/console.error com contexto)
- Remover 22 blocos de código comentado
- Resolver ou apagar 12 TODOs antigos
```

Após escrever, **pare** e mostre apenas o resumo executivo + caminho. Pergunte:

> "Auditoria salva em `./code-health-reports/...`. Encontrei **N BLOCKERS**. Quer que eu comece pelo Sprint 0 (quebra-galhos rápidos), ou prefere revisar o relatório completo primeiro?"

### Fase 5 — Aplicação dos fixes

**Diferença crítica em relação ao dead-code-cleanup:** aqui a aplicação raramente é automática. Cada fix requer decisão de produto.

#### Fluxo de fix item-a-item

Para cada finding aprovado pelo usuário:

1. **Reapresente o finding** (curto)
2. **Liste 2-3 opções de fix** com prós/contras
3. **Espere a escolha do usuário**
4. **Aplique a opção escolhida**
5. **Verifique** (`tsc --noEmit` no mínimo)
6. **Commit individual** com mensagem descritiva

Exemplo de interação:

```
Você (skill): Item 1/12 — Phantom button em app/dashboard/settings/page.tsx:87

  Botão "Salvar configurações" tem onClick={() => console.log("save")}.

  Opções:
  (A) Implementar Server Action saveSettings que escreve no DB.
      Pré-requisito: confirmar qual DB/ORM (Prisma? Drizzle? Supabase?).
  (B) Desabilitar o botão e adicionar tooltip "Em breve".
      Trivial, ~3min.
  (C) Remover o botão e a seção inteira (se a feature não é mais escopo).

  Qual?

Usuário: B

Você (skill): [aplica Edit]
              [roda npx tsc --noEmit]
              [git add app/dashboard/settings/page.tsx
               git commit -m "fix: disable non-functional 'Salvar configurações' button"]
              ✅ Item 1/12 resolvido. Próximo?
```

#### Fixes que VOCÊ pode fazer sem perguntar (modo turbo)

Apenas se o usuário disser explicitamente "modo turbo" ou "auto-fix os óbvios":

- Adicionar `disabled` + comentário em phantom buttons que só logam
- Trocar `catch {}` por `catch (e) { console.error('TODO: handle', e) }`
- Remover blocos de código comentados (após confirmar 1x)
- Mover mocks de rotas reais para `__mocks__/` com import comentado

Tudo o resto sempre pergunta.

## Padrões de detecção (com regex)

Veja `references/pattern-library.md` para a biblioteca completa. Resumo dos mais úteis:

```bash
# Phantom buttons (clique vazio ou só log)
rg -U --multiline '<(button|Button|a|Link)[^>]*onClick=\{(\(\)\s*=>\s*\{?\s*(console\.[a-z]+\([^)]*\))?\s*\}?)\}' --glob '*.{tsx,jsx}'

# Botões sem handler nenhum (e sem type="submit" em form)
rg -U '<button(?![^>]*onClick)(?![^>]*type=["\']submit["\'])[^>]*>' --glob '*.{tsx,jsx}'

# Mocked data (lorem ipsum)
rg -i 'lorem ipsum|dolor sit amet' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'

# Mocked emails / users
rg -i '(test|sample|fake|mock|dummy|john\.?doe|jane\.?doe)@(example|test|fake|mock)\.(com|org)' --glob '*.{ts,tsx,js,jsx}'

# Stub functions (return Promise.resolve() vazio)
rg -U --multiline 'function\s+\w+[^{]*\{\s*(//.*\n)*\s*return\s+(null|undefined|Promise\.resolve\(\)|\{\s*\}|\[\s*\])\s*;?\s*\}' --glob '*.{ts,tsx,js,jsx}'

# Throw not implemented
rg "throw\s+new\s+Error\s*\(\s*['\"](not\s+implemented|nyi|todo|fixme)" -i --glob '*.{ts,tsx,js,jsx}'

# Empty catch
rg -U --multiline 'catch\s*(\([^)]*\))?\s*\{\s*\}' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'

# Empty .catch
rg '\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)' --glob '*.{ts,tsx,js,jsx}'

# TODOs / FIXMEs
rg -n 'TODO|FIXME|XXX|HACK|@deprecated|@todo' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'
```

## Detector de rotas quebradas (algoritmo)

```bash
# 1. Listar todas as rotas existentes (App Router)
find app -type f -name 'page.*' | sed 's|app||; s|/page\.[a-z]*$||; s|^$|/|' > /tmp/existing-routes.txt

# 2. Listar todos os hrefs e router.push de strings literais
rg -n -o '(href|router\.push|router\.replace)\s*[=(]\s*["\']/([^"\']+)["\']' \
  --glob '*.{tsx,jsx,ts,js}' --glob '!node_modules' | \
  awk -F'"' '{print $2}' | grep '^/' | sort -u > /tmp/used-routes.txt

# 3. Para cada used-route, checar se existe (ou bate com dynamic [param])
while read route; do
  base=$(echo "$route" | sed 's|/[^/]*$||')
  # Procurar match exato ou via [param]
  if ! grep -qF "$route" /tmp/existing-routes.txt && \
     ! grep -qE "${base}/\[[^\]]+\]" /tmp/existing-routes.txt; then
    echo "BROKEN: $route"
  fi
done < /tmp/used-routes.txt
```

Para Pages Router, troque `app/` por `pages/` e adapte.

Para fetch interno (`fetch('/api/foo')`), use a mesma lógica contra `app/api/**/route.*` e `pages/api/**/*`.

## Regras de ouro

1. **Sempre apresente opções, nunca decida sozinho** o que substitui um mock ou implementa um stub. Você não sabe o domínio do produto.
2. **Quebra-galho honesto > funcionalidade fake.** Desabilitar um botão com tooltip "em breve" é melhor que deixar ele lá fingindo funcionar.
3. **Nunca remova um stub que está sendo chamado** sem propor um substituto ou desabilitar a chamada — você cria broken route ou função undefined.
4. **Distinga teste vs produção.** Mocks em `__tests__/` são bons. Mocks em `app/page.tsx` são ruins.
5. **Empty catch é sempre bug.** Se intencional (ex: "ignorar erro de tela offline"), exija comentário explícito justificando.

## Resultado final esperado

1. Relatório `code-health-reports/functional-audit-<timestamp>.md` com severidade clara
2. Veredito explícito (✅ production-ready / ❌ N blockers)
3. Branch `audit/functional-<data>` com commits por finding
4. Lista priorizada: o que travar deploy, o que pode ir depois

## Para deep-dives

- `references/pattern-library.md` — biblioteca completa de regex/patterns
- `references/fix-strategies.md` — estratégias de fix por categoria
- `references/severity-rubric.md` — rúbrica detalhada de severidade
