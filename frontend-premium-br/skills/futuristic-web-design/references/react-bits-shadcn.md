# React Bits, Magic UI e Motion Primitives via shadcn

Os três distribuem **código-fonte** que é copiado para o projeto (não são dependências npm). O MCP `shadcn` (deste plugin) lê o `components.json` do projeto e instala itens de qualquer registro declarado nele.

## Pré-requisitos no projeto

- React + Tailwind (as variantes `-TW`) ou CSS puro (variantes `-CSS`).
- `components.json` na raiz. Se não existir e o projeto **quiser** adotar shadcn: `npx shadcn@4.22.1 init` (cria `components.json`, utilitário `cn` e ajusta o CSS). Em projeto existente, isso altera arquivos: mostre o plano antes.
- Alias `@/` configurado no `tsconfig` e no bundler.

## Registro React Bits

Acrescente ao `components.json` (preserve o que já existir em `registries`):

```json
{
  "registries": {
    "@react-bits": "https://reactbits.dev/r/{name}.json"
  }
}
```

Nome do item = `<Componente>-<TS|JS>-<TW|CSS>`. Exemplos: `@react-bits/SplitText-TS-TW`, `@react-bits/Aurora-TS-TW`.

```bash
npx shadcn@4.22.1 view @react-bits/Aurora-TS-TW   # inspeciona sem instalar
npx shadcn@4.22.1 add  @react-bits/Aurora-TS-TW   # escreve em components/ e instala as deps do item
```

Magic UI e Motion Primitives funcionam por URL direta (ou declare-os também em `registries` se preferir nome curto):

```json
{
  "registries": {
    "@react-bits": "https://reactbits.dev/r/{name}.json",
    "@magicui": "https://magicui.design/r/{name}.json",
    "@motion-primitives": "https://motion-primitives.com/c/{name}.json"
  }
}
```

## Pelo MCP

Peça em linguagem natural ("busque um fundo de aurora no React Bits", "liste os componentes de texto do Magic UI"). O MCP `shadcn` busca nos registros do `components.json`; o MCP `magicui` busca direto no catálogo do Magic UI e devolve o comando de instalação.

## Antes de commitar um item

1. `view` primeiro: veja `dependencies` (alguns itens trazem `three`, `ogl`, `gsap`, `motion`). Dependência nova segue a regra de dependência do projeto (justificativa/ADR).
2. Leia o arquivo gerado: sem `fetch` remoto, `eval`, `innerHTML` com dado externo.
3. Adapte tokens (cores, fontes) ao design system; não deixe cor fixa do exemplo.
4. Adicione reduced-motion se o item não tiver.
5. React Bits é MIT + Commons Clause: uso em produto liberado; revender os componentes, não.

## Teste rápido de conectividade (sem projeto)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://reactbits.dev/r/SplitText-TS-TW.json   # 200
```
