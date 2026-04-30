# Estratégias de fix — por categoria

Para cada tipo de finding, qual é o conjunto de fixes que você deve oferecer ao usuário. Use isto como cardápio.

## Phantom buttons

### Cenário A — botão tem propósito claro pelo texto, só falta a lógica

Ex: `<button>Salvar</button>` com `onClick={() => {}}` em formulário de configurações.

**Opções para apresentar ao usuário:**

1. **Implementar Server Action** (recomendado se houver DB configurado)
   ```tsx
   // No mesmo arquivo ou em actions.ts
   'use server'
   export async function saveSettings(data: SettingsInput) {
     await db.settings.update({ where: { userId }, data })
     revalidatePath('/dashboard/settings')
   }
   // No componente
   <form action={saveSettings}>
     <button type="submit">Salvar</button>
   </form>
   ```

2. **Desabilitar visualmente até estar pronto** (quebra-galho honesto)
   ```tsx
   <button
     disabled
     title="Em breve"
     className="... opacity-50 cursor-not-allowed"
   >
     Salvar
   </button>
   ```

3. **Remover o botão** se a feature foi cortada do escopo
   ```tsx
   {/* Removido — feature postergada para v2 */}
   ```

### Cenário B — botão sem texto claro, ninguém sabe o que faz

Sempre opção de remover. Se mantido, exigir comentário do usuário sobre intenção.

## Broken routes

### Cenário A — link no menu para página inexistente

**Opções:**

1. **Criar a página com placeholder funcional**
   ```tsx
   // app/billing/page.tsx
   export default function BillingPage() {
     return (
       <main className="p-8">
         <h1 className="text-2xl font-bold">Cobrança</h1>
         <p className="mt-4 text-muted-foreground">
           Esta seção está em construção. Volte em breve.
         </p>
       </main>
     )
   }
   ```

2. **Remover o link da navegação**
   ```tsx
   // components/Nav.tsx — remover <Link href="/billing">
   ```

3. **Criar redirect** (se a rota foi renomeada)
   ```ts
   // next.config.js
   async redirects() {
     return [{ source: '/billing', destination: '/account/billing', permanent: true }]
   }
   ```

### Cenário B — fetch para endpoint /api/x inexistente

**Opções:**

1. **Criar o handler** com implementação mínima
   ```ts
   // app/api/x/route.ts
   import { NextResponse } from 'next/server'
   export async function GET() {
     return NextResponse.json({ data: [] })
   }
   ```

2. **Remover a chamada do frontend** (se a feature foi cortada)

3. **Wrap com try/catch + fallback** (se quebra-galho urgente)
   ```ts
   const res = await fetch('/api/x').catch(() => null)
   const data = res?.ok ? await res.json() : { fallback: true }
   ```

## Mocked data em rotas reais

### Cenário A — dataset hardcoded onde deveria ser DB query

**Opções:**

1. **Substituir por query real** (precisa saber qual ORM/DB)
   ```tsx
   // Antes
   const PRODUCTS = [{ id: 1, name: 'Sample 1' }, ...]

   // Depois (Prisma)
   const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } })

   // Ou Supabase (combina com saas-shield-br)
   const { data: products } = await supabase.from('products').select('*')
   ```

2. **Mover para fixture explícita** (se ainda não há DB ou em modo dev)
   ```ts
   // mocks/products.ts
   /**
    * FIXTURE — substituir por DB query antes de produção.
    * Origem: app/products/page.tsx (extraído em <data>)
    */
   export const PRODUCTS_FIXTURE = [...]

   // app/products/page.tsx
   import { PRODUCTS_FIXTURE } from '@/mocks/products'
   const products = process.env.USE_FIXTURES ? PRODUCTS_FIXTURE : await fetchFromDb()
   ```

3. **Remover a página inteira** (se a feature foi cortada)

### Cenário B — fetch interceptado por mock (msw, jest mock, etc.)

Verifique se o interceptor está ativo em produção. Se sim, removê-lo.

```ts
// main.tsx — desabilitar msw em produção
if (process.env.NODE_ENV === 'development') {
  const { worker } = await import('./mocks/browser')
  worker.start()
}
```

## Stub functions

### Cenário A — stub não chamado em lugar nenhum (órfão)

Trate como dead code. Use o skill `dead-code-cleanup`.

### Cenário B — stub chamado em código de produção

**Opções:**

1. **Implementar de verdade** (decisão de produto — apresentar requisitos)
2. **Adicionar guard com feature flag**
   ```ts
   export async function processPayment(orderId: string) {
     if (!process.env.STRIPE_ENABLED) {
       throw new Error('Pagamentos temporariamente indisponíveis')
     }
     // implementação real aqui
   }
   ```
3. **Substituir chamadas por mensagem ao usuário**
   ```tsx
   <button onClick={() => alert('Pagamentos disponíveis em breve')}>
     Pagar
   </button>
   ```

### Cenário C — stub que lança "Not implemented"

Pior dos mundos: parece funcionar até ser chamado, então quebra produção. Sempre BLOCKER. Mesmas 3 opções acima.

## Empty error handlers

### Cenário A — `catch {}` ou `.catch(() => {})`

**Opção 1 — adicionar logging mínimo** (auto-fix seguro)
```ts
catch (error) {
  console.error('TODO: handle properly', error)
}

// promise version
.catch(error => console.error('TODO: handle properly', error))
```

**Opção 2 — propagar erro** (se quem chama deve tratar)
```ts
catch (error) {
  throw new Error(`Failed to ${operation}: ${error.message}`)
}
```

**Opção 3 — comentar intencionalidade** (se ignorar é correto)
```ts
catch {
  // Intencional: erro de leitura offline é esperado e ignorado
}
```

**Opção 4 — integrar Sentry/Datadog** (se já configurado)
```ts
import * as Sentry from '@sentry/nextjs'
catch (error) {
  Sentry.captureException(error)
  throw error
}
```

### Cenário B — onError vazio em React Query / SWR

Sempre adicionar mostrar feedback ao usuário:

```tsx
useQuery({
  queryKey: [...],
  queryFn: ...,
  onError: (error) => {
    toast.error(`Erro ao carregar: ${error.message}`)
    console.error(error)
  }
})
```

## TODOs antigos

### Triagem

Para cada TODO:
1. Procurar autor e data via `git blame`
2. Procurar tickets relacionados (Linear/Jira/GitHub Issue) com `gh issue list --search 'TODO context'`
3. Decidir:

**Opção 1 — resolver agora** (se é trivial)
**Opção 2 — converter em issue/ticket** (`gh issue create -t "TODO: ..." -b "Origem: file:line"`)
**Opção 3 — apagar** (se a referência não faz mais sentido)

Nunca deixar TODOs com mais de 1 ano sem decisão.

## Código comentado

### Cenário A — código que claramente foi substituído por outro

Apagar. O git já guarda o histórico.

### Cenário B — código comentado com nota explicativa ("manter para referência")

Mover para um arquivo `docs/legacy/<feature>.md` com contexto explicativo. Apagar do código fonte.

### Cenário C — feature flag implementada via comentário

Erro. Implementar feature flag de verdade:

```ts
// Antes
// if (USE_NEW_FLOW) { ... }
// else { ... }

// Depois
if (process.env.NEXT_PUBLIC_NEW_FLOW === 'true') {
  // ...
} else {
  // ...
}
```

## Imagens placeholder (via.placeholder.com etc.)

**Opções:**

1. **Substituir por asset real** (precisa do designer)
2. **Hospedar localmente como placeholder neutro**
   ```tsx
   import placeholder from '@/public/placeholder.png'
   <Image src={imageUrl ?? placeholder} ... />
   ```
3. **Adicionar fallback gerado**
   ```tsx
   <div className="bg-muted rounded">
     {imageUrl ? <Image src={imageUrl} ... /> : <div className="...">Sem imagem</div>}
   </div>
   ```

## Princípios gerais ao apresentar opções

- **Sempre dê de 2 a 4 opções** — nunca uma única solução imposta
- **Sempre marque qual é "rápida e segura" (quebra-galho) vs qual é "certa" (mais trabalho)**
- **Sempre estime esforço** ("~3 min" vs "~1 dia")
- **Sempre liste pré-requisitos** ("precisa do Stripe configurado")
- **Nunca aplique a opção sem confirmação** exceto em modo turbo explícito

## Verificação após cada fix

```bash
# Pelo menos isto, sempre
npx tsc --noEmit

# Se for fix em rota
pnpm build 2>&1 | tail -20

# Se for fix em handler de evento ou lógica de UI
# rodar a aplicação localmente e testar manualmente o fluxo (peça ao usuário)
```
