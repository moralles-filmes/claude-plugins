# Biblioteca de patterns — auditoria funcional

Carregue quando precisar dos regex completos para um detector específico. Otimizados para JS/TS/React/Next.js.

## 1. Phantom buttons (botões sem função real)

### 1a. onClick com handler vazio

```bash
# onClick={() => {}}
rg -U --multiline 'onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}' --glob '*.{tsx,jsx}'

# onClick={() => null}
rg 'onClick=\{\s*\(\s*\)\s*=>\s*null\s*\}' --glob '*.{tsx,jsx}'

# onClick={(e) => e.preventDefault()} (e nada mais)
rg -U --multiline 'onClick=\{\s*\([^)]*\)\s*=>\s*[a-z]\.preventDefault\(\)\s*\}' --glob '*.{tsx,jsx}'
```

### 1b. onClick que só loga

```bash
# onClick={() => console.log(...)}
rg 'onClick=\{\s*\(\s*\)\s*=>\s*console\.[a-z]+\(' --glob '*.{tsx,jsx}'

# Versão com bloco {} contendo só console.*
rg -U --multiline 'onClick=\{\s*\(\s*\)\s*=>\s*\{\s*console\.[a-z]+\([^)]*\)\s*;?\s*\}\s*\}' --glob '*.{tsx,jsx}'
```

### 1c. Botão sem handler nenhum (e sem ser submit)

```bash
# <button> com texto mas sem onClick e sem type="submit"
rg -U --multiline '<button(?![^>]*\b(onClick|type=["\']submit["\']|type=["\']reset["\'])\b)[^>]*>[^<]*[a-zA-ZÀ-ÿ]' --glob '*.{tsx,jsx}'
```

Nota: dentro de `<form>`, um `<button>` sem type vira submit por padrão (ok). Confirme cruzando com presença de `<form>` ancestral.

### 1d. Link com href vazio ou placeholder

```bash
rg 'href=["\'](#|\?|javascript:void)' --glob '*.{tsx,jsx,html}'
```

## 2. Broken routes

### 2a. Listagem de rotas existentes (App Router)

```bash
find app -type f \( -name 'page.tsx' -o -name 'page.ts' -o -name 'page.jsx' -o -name 'page.js' \) | \
  sed -e 's|^app||' -e 's|/page\.[a-z]*$||' -e 's|^$|/|' | sort -u > /tmp/existing-routes.txt
```

### 2b. Listagem de rotas existentes (Pages Router)

```bash
find pages -type f -not -path '*/api/*' \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' \) | \
  sed -e 's|^pages||' -e 's|\.[a-z]*$||' -e 's|/index$||' -e 's|^$|/|' | sort -u >> /tmp/existing-routes.txt
```

### 2c. Listagem de endpoints de API existentes

```bash
# App Router
find app -type f -name 'route.*' | sed -e 's|^app||' -e 's|/route\.[a-z]*$||' >> /tmp/existing-api.txt

# Pages Router
find pages/api -type f \( -name '*.ts' -o -name '*.js' \) | \
  sed -e 's|^pages||' -e 's|\.[a-z]*$||' -e 's|/index$||' >> /tmp/existing-api.txt
```

### 2d. Hrefs literais usados no código

```bash
rg -n -o '(href|to|router\.push|router\.replace|redirect|navigate)\s*[=(]\s*["\'](/[^"\']*)["\']' \
  --glob '*.{tsx,jsx,ts,js}' --glob '!node_modules' --glob '!.next' \
  | sed -E 's|.*"(/[^"]+)".*|\1|; s|.*'"'"'(/[^'"'"']+)'"'"'.*|\1|' \
  | sort -u > /tmp/used-routes.txt
```

### 2e. fetch para endpoints internos

```bash
rg -n -o "fetch\s*\(\s*[\"']/api/([^\"']+)[\"']" --glob '*.{tsx,jsx,ts,js}' --glob '!node_modules'
```

### 2f. Cruzamento — rotas usadas que não existem

```bash
while read route; do
  # Match exato
  if grep -qxF "$route" /tmp/existing-routes.txt; then continue; fi
  # Match com dynamic segment [param]
  match_found=false
  while read existing; do
    pattern=$(echo "$existing" | sed 's|\[[^]]*\]|[^/]+|g')
    if echo "$route" | grep -qE "^${pattern}$"; then
      match_found=true
      break
    fi
  done < /tmp/existing-routes.txt
  $match_found || echo "BROKEN: $route"
done < /tmp/used-routes.txt
```

## 3. Mocked data

### 3a. Lorem ipsum

```bash
rg -i 'lorem\s+ipsum|dolor\s+sit\s+amet|consectetur\s+adipiscing' \
  --glob '*.{ts,tsx,js,jsx,md,mdx}' --glob '!node_modules' --glob '!.next'
```

### 3b. Emails fake

```bash
rg -i "[a-z0-9._-]+@(example|test|fake|mock|sample|dummy|local|invalid|placeholder)\.(com|org|net|io)" \
  --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' --glob '!__tests__' --glob '!*.test.*' --glob '!*.spec.*'
```

### 3c. Nomes claramente fake

```bash
rg -i '\b(john\s+doe|jane\s+doe|test\s+user|sample\s+user|foo\s+bar|user\s+\d+|fake\s+name)\b' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' --glob '!__tests__' --glob '!*.test.*'
```

### 3d. IDs sequenciais hardcoded (sinal de mock)

```bash
rg -U --multiline '\[\s*\{\s*id:\s*1[^}]*\}\s*,\s*\{\s*id:\s*2[^}]*\}\s*,\s*\{\s*id:\s*3' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!__tests__' --glob '!*.test.*'
```

### 3e. Constantes com nome de mock

```bash
rg '^(const|let|var)\s+(MOCK|FAKE|SAMPLE|DUMMY|TEST|FIXTURE|PLACEHOLDER)_?' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!__tests__' --glob '!*.test.*' --glob '!__mocks__/*'
```

### 3f. Arrays de strings claramente decorativos

```bash
# Ex: ['Item 1', 'Item 2', 'Item 3', ...]
rg -U --multiline "\\[\\s*['\"]Item\\s*1['\"][^]]*\\]" --glob '*.{ts,tsx,js,jsx}'

# Ex: nomes de placeholder (Foo/Bar/Baz)
rg -U --multiline "\\[[^]]*['\"]Foo['\"][^]]*['\"]Bar['\"][^]]*\\]" --glob '*.{ts,tsx,js,jsx}'
```

### 3g. Imagens placeholder

```bash
rg "(via\.placeholder\.com|placehold\.it|placekitten\.com|placedog\.net|loremflickr\.com|picsum\.photos)" \
  --glob '*.{ts,tsx,js,jsx,html,md,mdx}' --glob '!node_modules'
```

## 4. Stub functions

### 4a. Função que só retorna null/undefined/{}

```bash
# Async function que só retorna Promise.resolve()
rg -U --multiline 'async\s+(function\s+\w+|\([^)]*\)\s*=>)[^{]*\{\s*(//.*\n)*\s*return\s+(undefined|null|Promise\.resolve\(\)|\{\s*\})\s*;?\s*\}' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!__tests__' --glob '!*.test.*'

# Function regular que só retorna primitivo
rg -U --multiline 'function\s+\w+\s*\([^)]*\)\s*[^{]*\{\s*(//.*\n)*\s*return\s+(null|undefined|true|false|0|""|''|\{\s*\}|\[\s*\])\s*;?\s*\}' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!__tests__' --glob '!*.test.*'
```

### 4b. Throw not implemented

```bash
rg -i "throw\s+new\s+(Error|TypeError|ReferenceError)\s*\(\s*['\"]?(not\s+implemented|nyi|todo|fixme|coming\s+soon|wip|placeholder)" \
  --glob '*.{ts,tsx,js,jsx}'
```

### 4c. Função com corpo só comentário

```bash
rg -U --multiline 'function\s+\w+\s*\([^)]*\)\s*[^{]*\{\s*(//[^\n]*\n\s*)+\}' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!__tests__'
```

### 4d. Identificar onde stubs são chamados (cross-reference)

Quando um stub for encontrado em `lib/payments.ts` na função `processPayment`:

```bash
rg -n "processPayment\s*\(" --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'
```

Se houver chamadas em rotas/componentes (não em testes), severidade vira BLOCKER.

## 5. Empty handlers

### 5a. catch vazio

```bash
rg -U --multiline 'catch\s*(\([^)]*\))?\s*\{\s*\}' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' --glob '!.next'
```

### 5b. .catch promise vazio

```bash
rg "\\.catch\\s*\\(\\s*\\(\\s*[a-z_]?\\s*\\)\\s*=>\\s*\\{?\\s*\\}?\\s*\\)" \
  --glob '*.{ts,tsx,js,jsx}'

# .catch(() => null), .catch(() => undefined)
rg "\\.catch\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*(null|undefined|''|\"\")\\s*\\)" \
  --glob '*.{ts,tsx,js,jsx}'
```

### 5c. onError vazio em form/handlers

```bash
rg -U --multiline 'onError:\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*' --glob '*.{ts,tsx,js,jsx}'
rg -U --multiline 'onError=\{\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\}' --glob '*.{tsx,jsx}'
```

## 6. TODOs / FIXMEs com idade

```bash
# Listar todos
rg -n '(TODO|FIXME|XXX|HACK|@deprecated|@todo)\b' \
  --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' --glob '!.next'

# Com idade (último commit que tocou na linha)
rg -n '(TODO|FIXME|XXX|HACK)\b' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' | \
  while IFS=: read file line rest; do
    blame=$(git blame -L "${line},${line}" --date=short -- "$file" 2>/dev/null | head -1)
    date=$(echo "$blame" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    age_days=$(( ( $(date +%s) - $(date -d "$date" +%s 2>/dev/null || echo 0) ) / 86400 ))
    if [ "$age_days" -gt 180 ]; then
      echo "OLD($age_days days): $file:$line | $rest"
    fi
  done
```

## 7. Código comentado

### 7a. Blocos /* */ grandes

```bash
rg -U --multiline '/\*[\s\S]{300,}?\*/' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'
```

### 7b. Blocos // sequenciais (5+ linhas)

```bash
rg -U --multiline '(^\s*//[^\n]*\n){5,}' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules'
```

### 7c. JSX comentado

```bash
rg -U --multiline '\{/\*\s*<[A-Z][\s\S]*?\*/\}' --glob '*.{tsx,jsx}'
```

## Patterns auxiliares (Next.js específico)

### Componentes Server vs Client incompatíveis

```bash
# Server Action chamada em componente sem 'use client'
# (regex aproximado — confirme manualmente)
rg -l "^['\"]use client['\"]" --glob '*.{tsx,jsx}' > /tmp/client-files.txt
```

### Metadata em rota dinâmica sem generateMetadata

```bash
# Páginas com [param] sem generateMetadata
for f in $(find app -path '*\[*\]*' -name 'page.*'); do
  if ! grep -q 'generateMetadata' "$f"; then
    echo "MISSING_METADATA: $f"
  fi
done
```

### env vars não documentadas

```bash
# process.env.X usado mas não em .env.example
rg -o 'process\.env\.([A-Z_]+)' --glob '*.{ts,tsx,js,jsx}' --glob '!node_modules' \
  | sort -u > /tmp/used-env.txt

if [ -f .env.example ]; then
  grep -oE '^[A-Z_]+' .env.example | sort -u > /tmp/declared-env.txt
  comm -23 /tmp/used-env.txt /tmp/declared-env.txt
fi
```
