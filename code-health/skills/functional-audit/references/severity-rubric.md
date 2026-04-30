# Rúbrica de severidade

Use para classificar findings consistentemente.

## 🔴 BLOCKER — bloqueia deploy para produção

Um finding é BLOCKER se **uma das três** for verdadeira:

1. **Quebra a primeira interação do usuário** com a feature (clicar e nada acontecer, navegar e dar 404, submeter form e nada salvar)
2. **Engana o usuário** sobre algo crítico (botão "Pagar" que não cobra, "Salvar" que não persiste, "Confirmar pedido" que retorna `Promise.resolve(true)` sem fazer nada)
3. **Compromete dados/segurança** (catch vazio em código que escreve no DB, autenticação stub, validação de input que retorna sempre `true`)

Exemplos:
- Phantom button em fluxo de checkout/signup/login: BLOCKER
- Broken route na navegação principal: BLOCKER
- Mocked payment processing: BLOCKER
- Empty catch em código de upload de arquivo: BLOCKER
- `if (user.isAdmin) {...}` mas `isAdmin` é stub que sempre retorna true: BLOCKER

## 🟠 HIGH — corrigir antes do próximo lançamento público

1. **Funciona, mas com dados fake** (lista de produtos hardcoded, contador de usuários falso, gráfico com dados estáticos)
2. **Empty error handler em código não-crítico** (catch vazio em código de telemetria, analytics)
3. **Imagem/asset placeholder** (logo via placehold.co, avatar gerado dinamicamente porque não tem upload)
4. **Loading state inadequado** (skeleton quando deveria ter spinner real, ou vice-versa)
5. **Páginas em construção sem aviso** (página renderiza vazia ou com `<h1>TODO</h1>`)

Exemplos:
- Lista de "produtos em destaque" hardcoded na home: HIGH
- `<Avatar>` com iniciais geradas porque não há foto real: HIGH
- Gráfico no dashboard com `data: [10, 20, 30, 40]` hardcoded: HIGH

## 🟡 MEDIUM — débito técnico, próximo sprint

1. **TODOs/FIXMEs** com menos de 6 meses
2. **Código comentado** que parece ser referência ("manter por enquanto")
3. **Console.logs esquecidos** em código não-crítico
4. **Mocked data em features secundárias** (página de "Sobre", FAQ estático)
5. **Empty handlers documentados** (catch com comentário "TODO: handle")

Exemplos:
- `// TODO: refresh tokens` em código de auth (mas tokens funcionam): MEDIUM
- Página `/about` com lorem ipsum: MEDIUM
- `console.log('user:', user)` em handler de form: MEDIUM

## 🟢 LOW — limpeza opcional

1. **Findings em test files** (`*.test.*`, `*.spec.*`, `__tests__/`)
2. **Findings em arquivos de demo/playground/sandbox**
3. **Findings em Storybook stories**
4. **Comentários estilo "explicação histórica"**
5. **TODOs claramente labeled como "ideias para v2"**

Exemplos:
- Mock data em `users.test.ts`: LOW (mocks em teste são corretos)
- `<DemoButton/>` com `onClick={() => {}}` em página de showcase: LOW
- TODO: "v2: adicionar dark mode": LOW

## Modificadores de severidade

### Fatores que SOBEM a severidade

- Está em rota pública (sem auth check) → +1 nível
- Está em fluxo de onboarding/signup/checkout → +1 nível
- Está em endpoint de API → +1 nível
- Tem mais de 6 meses (TODO/FIXME) → +1 nível
- Múltiplos findings da mesma categoria no mesmo arquivo → +1 nível

### Fatores que DESCEM a severidade

- Está claramente em código de teste ou demo → -1 nível
- Está atrás de feature flag explicitamente desabilitada → -1 nível
- Está em código com comentário documentando intencionalidade → -1 nível

## Veredito final

Após classificar todos os findings, gere um veredito:

```
✅ PRODUCTION-READY — 0 BLOCKERs, ≤5 HIGHs
```
ou
```
⚠️ NEEDS-WORK — 0 BLOCKERs, mais de 5 HIGHs ou mais de 30 MEDIUMs
Sugestão: aplicar quebra-galhos nos HIGHs antes do próximo deploy.
```
ou
```
❌ NOT-PRODUCTION-READY — N BLOCKERs encontrados
Lista de blockers (resumo):
1. ...
2. ...
Sugestão: corrigir todos antes de qualquer release público.
```

## Como apresentar a severidade

No relatório final, sempre:
- Use as cores/emojis (🔴🟠🟡🟢) para escaneamento rápido
- Inclua o veredito no topo
- Liste BLOCKERs primeiro, sempre
- Para cada finding, inclua: arquivo:linha, snippet, motivo da severidade, opções de fix
