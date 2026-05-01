---
name: responsive-mobile-first
description: Checklist + padrões Tailwind para garantir que toda tela do SaaS funcione mobile-first, com layouts que escalam para tablet/desktop sem refazer markup. Cobre breakpoints canônicos, padrões de sidebar (drawer no mobile, fixa no desktop), tabela responsiva (vira card em mobile), forms responsivos, container queries, safe-area iOS. Use ao construir qualquer tela ou auditar tela existente.
---

# Responsivo mobile-first — checklist Tailwind para SaaS

## Filosofia

Você escreve mobile primeiro (sem prefixo), e adiciona `md:` / `lg:` para AMPLIAR. Nunca o contrário. Isso garante:
- Bundle CSS menor
- Comportamento previsível em telas que você esqueceu de testar
- Acessibilidade móvel não é afterthought

## Breakpoints canônicos

| Prefixo | Largura | Equivalente |
|---|---|---|
| (nenhum) | 0px+ | Mobile (iPhone SE = 375px) |
| `sm:` | 640px+ | Mobile grande / phablet landscape |
| `md:` | 768px+ | Tablet portrait |
| `lg:` | 1024px+ | Tablet landscape / Desktop pequeno |
| `xl:` | 1280px+ | Desktop |
| `2xl:` | 1536px+ | Wide |

## Padrões essenciais

### 1. Layout principal — sidebar fixa desktop, drawer mobile

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useUiStore();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile: drawer overlay */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 transform bg-surface border-r border-border transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar />
      </aside>

      {/* Backdrop só mobile */}
      {sidebarOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
```

### 2. Container responsivo

Use a config do Tailwind (`container: { center: true, padding: "1rem" }`) ou faça manual:

```tsx
<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

### 3. Grid responsivo (cards)

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(...)}
</div>
```

### 4. Form responsivo

```tsx
<form className="space-y-4">
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <Field label="Nome">
      <Input name="name" />
    </Field>
    <Field label="E-mail">
      <Input name="email" type="email" />
    </Field>
  </div>

  <Field label="Mensagem" className="md:col-span-2">
    <Textarea rows={4} />
  </Field>

  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
    <Button variant="ghost" type="button">Cancelar</Button>
    <Button type="submit">Salvar</Button>
  </div>
</form>
```

### 5. Tabela vira card em mobile (padrão SaaS pro)

Tabela em desktop, lista de cards em mobile — sem bagunçar markup:

```tsx
export function InvoicesTable({ rows }: { rows: Invoice[] }) {
  return (
    <>
      {/* Desktop */}
      <table className="hidden w-full lg:table">
        <thead>
          <tr className="border-b border-border text-left text-sm text-foreground-muted">
            <th className="py-3 pr-4">Data</th>
            <th className="py-3 pr-4">Cliente</th>
            <th className="py-3 pr-4 text-right">Valor</th>
            <th className="py-3 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="py-3 pr-4">{format.date(r.created_at)}</td>
              <td className="py-3 pr-4">{r.client_name}</td>
              <td className="py-3 pr-4 text-right tabular-nums">{format.brl(r.amount)}</td>
              <td className="py-3 pr-4"><Badge>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <ul className="space-y-3 lg:hidden">
        {rows.map(r => (
          <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.client_name}</span>
              <Badge>{r.status}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm text-foreground-muted">
              <span>{format.date(r.created_at)}</span>
              <span className="tabular-nums text-foreground">{format.brl(r.amount)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
```

### 6. Modal vs Drawer no mobile

Use `Drawer` (do Vaul ou similar) em mobile e `Dialog` (Radix) em desktop:

```tsx
const isMobile = useMediaQuery("(max-width: 767px)");
const Wrapper = isMobile ? Drawer : Dialog;
```

Ou só use Dialog com tamanho responsivo:
```tsx
<Dialog.Content className="fixed inset-x-0 bottom-0 rounded-t-2xl bg-surface p-6 sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-w-lg">
```

### 7. Botão de ação flutuante (FAB) só mobile

```tsx
<Button
  className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full shadow-lg lg:hidden"
  size="icon"
  onClick={openCreate}
  aria-label="Criar nova"
>
  <Plus className="h-6 w-6" />
</Button>
```

### 8. Texto responsivo

Padrões:
```html
<h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">
<p className="text-sm sm:text-base">
```

Use `clamp()` quando o range é amplo:
```html
<h1 className="text-[clamp(1.5rem,4vw,3rem)] font-bold">
```

### 9. Imagens responsivas + sem CLS

```tsx
<img
  src={url}
  alt=""
  loading="lazy"
  width={400}
  height={300}
  className="h-auto w-full rounded-lg object-cover"
/>
```

`width` + `height` reservam espaço — evita Cumulative Layout Shift.

### 10. Safe area iOS (notch + home indicator)

```css
/* tokens.css */
@layer base {
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

Ou use plugin `tailwindcss-safe-area` para classes utilitárias.

## Checklist por tela

Para cada tela do SaaS, verifique:

- [ ] Funciona em 320px de largura sem scroll horizontal
- [ ] Tap targets ≥ 44x44px em mobile (`h-11 w-11` ou `min-h-[44px]`)
- [ ] Texto principal ≥ 16px (`text-base`)
- [ ] Cards/listas viram coluna única em mobile
- [ ] Sidebar é drawer abaixo de `lg:`
- [ ] Tabelas têm versão card em mobile
- [ ] Forms têm botões em coluna em mobile, linha em desktop
- [ ] Modal cobre tela em mobile, centraliza em desktop
- [ ] Imagens têm `width`/`height` ou `aspect-ratio` definido
- [ ] `tabular-nums` em colunas numéricas
- [ ] `truncate` em títulos longos com tooltip
- [ ] Skip link "Pular para conteúdo" para a11y
- [ ] Foco visível em keyboard navigation

## Container queries (quando entrar em produção)

Para componentes que mudam baseado no PARENT (não viewport):

```tsx
<div className="@container">
  <div className="flex flex-col @md:flex-row">
    {/* "@md:" ativa quando o container tem >= 28rem */}
  </div>
</div>
```

Habilita no `tailwind.config.ts`:
```ts
plugins: [require("@tailwindcss/container-queries")],
```

## Anti-padrões

- ❌ Largura fixa `w-[600px]` sem `max-w-` ou `lg:`
- ❌ `overflow-x-auto` na página inteira (esconde bug responsivo)
- ❌ Texto em `text-[12px]` ou menor
- ❌ Tap target 32x32px (Apple guideline = 44, Material = 48)
- ❌ Sidebar fixa em mobile (cobre tela inteira)
- ❌ Form com 4 inputs em linha em mobile (vira sopa)
- ❌ Tabela com 8 colunas em mobile (scroll horizontal infernal)
- ❌ Modal com largura fixa que estoura em mobile
- ❌ Esquecer `viewport` meta no `index.html`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  ```
