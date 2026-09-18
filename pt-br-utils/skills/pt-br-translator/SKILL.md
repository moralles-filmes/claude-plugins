---
name: pt-br-translator
description: Revisa strings de UI em português brasileiro (PT-BR) — gênero consistente, formalidade (você vs tu), erros idiomáticos comuns, formatação BR de data/número/moeda, mensagens de erro úteis. Use quando o usuário pedir "revisa o português", "traduz isso pra PT-BR", "isso aqui tá em português correto?", "checa as strings da UI", "audit pt-br", "review traduções", ou ao analisar arquivos de i18n / strings de UI.
---

# pt-br-translator

Você revisa textos de interface em português brasileiro com olhar de UX writer brasileiro. Não é só tradução — é fluência idiomática, consistência de tom, e clareza.

## Quando ativa

- "Revisa o português"
- "Traduz pra PT-BR"
- "Isso aqui tá certo em português?"
- Arquivos de i18n: `locales/pt-BR.json`, `messages/pt-BR.ts`
- Strings hardcoded em JSX que parecem traduzidas literalmente

## Princípios

### 1. Você (não tu, não vós)
- ✅ "Você precisa confirmar o e-mail"
- ❌ "Tu precisas confirmar o e-mail"
- ❌ "Vocês precisam..." (a não ser que seja claramente plural)

### 2. Tom: Profissional + Próximo
SaaS brasileiros usam tom semi-formal — "você", evite contrações coloquiais ("não está" — não "não tá") em UI de produto B2B, mas pode usar tom mais leve em onboarding/marketing.

- ✅ "Sua assinatura expira em 3 dias"
- ❌ "Sua assinatura vai expirar em 3 dias" (verboso)
- ❌ "Tua assinatura tá expirando" (informal demais para SaaS B2B)

### 3. Voz ativa
- ✅ "Salve para continuar"
- ❌ "Para continuar, deve-se salvar"

### 4. Imperativo direto em CTAs
- ✅ "Criar conta"
- ❌ "Crie sua conta" (ok, mas mais longo)
- ❌ "Cliquei aqui para criar conta" (errado — passado)

## Erros idiomáticos comuns (50+ casos)

### Tradução literal que não funciona

| EN | ❌ Literal | ✅ Idiomático |
|---|---|---|
| "Sign in" | "Sinal entrada" | "Entrar" |
| "Sign up" | "Cadastrar acima" | "Criar conta" / "Cadastre-se" |
| "Log out" | "Saída de log" | "Sair" |
| "Reset password" | "Reiniciar senha" | "Redefinir senha" |
| "Forgot password?" | "Esqueci senha?" | "Esqueceu sua senha?" |
| "Welcome back" | "Bem-vindo de volta" (ok mas) | "Bom te ver de novo" / "Bem-vindo novamente" |
| "Your trial expires soon" | "Seu trial expira logo" | "Seu período de teste expira em breve" |
| "Upload" | "Upload" (ok) ou | "Enviar" / "Carregar" |
| "Submit" | "Submeter" | "Enviar" / "Confirmar" |
| "Save changes" | "Salvar mudanças" | "Salvar alterações" |
| "Settings" | "Configurações" ✅ | (correto) |
| "Logged in as" | "Logado como" | "Conectado como" / "Você está como" |
| "Loading..." | "Carregando..." ✅ | (correto, pode usar "Aguarde...") |
| "Pending" | "Pendurado" | "Pendente" |
| "Drafts" | "Esboços" (ok mas) | "Rascunhos" |
| "Published" | "Publicizado" | "Publicado" |
| "Disabled" | "Desativado" ✅ | (correto) |
| "Read more" | "Ler mais" ✅ | (correto, ou "Saiba mais") |
| "Get started" | "Pegue iniciado" | "Começar" / "Vamos começar" |
| "Learn more" | "Aprender mais" | "Saiba mais" |
| "Try again" | "Tente novamente" ✅ | (correto) |
| "Something went wrong" | "Algo foi errado" | "Algo deu errado" |
| "We couldn't..." | "Nós não pudemos..." | "Não foi possível..." |
| "Please wait" | "Por favor espere" | "Aguarde" |

### Concordância de gênero

Strings dinâmicas precisam adaptar:
```ts
// ❌ presume gênero
"Bem-vindo, {name}!"

// ✅ neutro
"Olá, {name}!"
"Boas-vindas, {name}!"
```

```ts
// ❌
"O usuário foi adicionado"  // se for "a usuária"...

// ✅
"Adicionado(a) com sucesso"  // ainda meio feio
"Adicionou: {nome}"           // melhor
"{nome} foi adicionado à equipe"  // se nome contextualiza
```

### "É" vs "está"
- "Você é logado" ❌ → "Você está conectado" ✅ ou "Login feito"
- "Está sucesso" ❌ → "Concluído!" ✅
- "Sua conta é ativa" ❌ → "Sua conta está ativa" ✅

### Pronome "lhe" — evite
- ❌ "Enviaremos um e-mail lhe confirmando"
- ✅ "Você receberá um e-mail de confirmação"

## Formatação brasileira

### Datas
- ✅ `25/04/2026` (DD/MM/AAAA)
- ❌ `04/25/2026` (formato US)
- ✅ `25 de abril de 2026` (longo)
- Use `Intl.DateTimeFormat('pt-BR')` ou `date-fns/locale/pt-BR`

### Números
- ✅ `1.234,56` (ponto = milhar, vírgula = decimal)
- ❌ `1,234.56` (formato US)
- Use `Intl.NumberFormat('pt-BR')`

### Moeda
- ✅ `R$ 1.234,56`
- ❌ `R$1234.56` ou `$1,234.56`
- Espaço entre `R$` e número
- Use `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`

### Telefone
- ✅ `(11) 91234-5678` (celular) ou `(11) 1234-5678` (fixo)
- Máscara em input com biblioteca tipo `react-imask`

### CEP
- ✅ `01310-100`
- ❌ `01310100`

### CPF / CNPJ
- ✅ `123.456.789-01` (CPF)
- ✅ `12.345.678/0001-99` (CNPJ)
- Valide com bibliotecas (`@brazilian-utils/brazilian-utils`)

## Mensagens de erro úteis

Princípio: **diga o que aconteceu + o que fazer**.

### ❌ Inúteis
- "Erro"
- "Algo deu errado"
- "Erro 500"
- "Falha na operação"

### ✅ Úteis
- "Não foi possível salvar. Verifique sua conexão e tente novamente."
- "E-mail já cadastrado. Faça login ou redefina sua senha."
- "Senha precisa ter pelo menos 8 caracteres, com 1 número."
- "Sessão expirou. Faça login novamente."
- "Limite de convites atingido (5 de 5). Atualize seu plano para convidar mais usuários."

## Empty states

Não escreva "Nenhum dado" — escreva o contexto.

- ❌ "Lista vazia"
- ✅ "Você ainda não criou nenhuma fatura. [Criar primeira fatura]"
- ✅ "Sem notificações por enquanto. Volte mais tarde."

## Saída esperada

```
🇧🇷 REVISÃO PT-BR — <arquivo ou módulo>

🟢 Bom: <N>/<total> strings
⚠️ Melhorias sugeridas: <N>
❌ Erros: <N>

═══════════════════════════════════════════
ERROS

  pt-BR.json:42  "Logado como {name}"
    ✅ "Conectado como {name}" ou "Você é {name}"

  pt-BR.json:57  "Algo foi errado"
    ✅ "Algo deu errado. Tente novamente."

═══════════════════════════════════════════
SUGESTÕES

  Login.tsx:14  "Sign in" hardcoded em JSX
    → Mover para i18n e usar "Entrar"

  Toast.tsx:8   "Sucesso!"
    → Específico: "Fatura salva" / "Convite enviado"

═══════════════════════════════════════════
CONSISTÊNCIA

  - "Cadastrar" usado 4x e "Criar conta" usado 6x — escolha 1
  - "Senha" e "Password" misturados — sempre "Senha"

═══════════════════════════════════════════
FORMATAÇÃO

  Dashboard.tsx:120  exibe data em MM/DD
    → Use Intl.DateTimeFormat('pt-BR')
```

## Glossário recomendado (consistência)

| Conceito | Termo padrão |
|---|---|
| Sign in / Log in | **Entrar** |
| Sign up / Register | **Criar conta** |
| Sign out / Log out | **Sair** |
| Email | **E-mail** (com hífen, oficial) |
| Password | **Senha** |
| Username | **Nome de usuário** |
| Settings | **Configurações** |
| Profile | **Perfil** |
| Account | **Conta** |
| Subscription | **Assinatura** |
| Plan | **Plano** |
| Billing | **Faturamento** / **Cobrança** |
| Invoice | **Fatura** |
| Payment method | **Método de pagamento** / **Forma de pagamento** |
| Trial | **Período de teste** / **Trial** (anglicismo aceito) |
| Upgrade | **Fazer upgrade** / **Atualizar plano** |
| Downgrade | **Fazer downgrade** / **Reduzir plano** |
| Cancel | **Cancelar** |
| Confirm | **Confirmar** |
| Save | **Salvar** |
| Delete | **Excluir** (mais formal) ou **Apagar** |
| Edit | **Editar** |
| Update | **Atualizar** |
| Loading | **Carregando** |
| Saving... | **Salvando...** |
| Saved! | **Salvo** ou **Alterações salvas** |
| Submit | **Enviar** |
| Reset | **Redefinir** (senha) ou **Limpar** (formulário) |
| Search | **Pesquisar** ou **Buscar** |
| Filter | **Filtrar** / **Filtros** |
| Sort | **Ordenar** |
| Export | **Exportar** |
| Import | **Importar** |
| Share | **Compartilhar** |
| Copy | **Copiar** |
| Paste | **Colar** |
| Copy link | **Copiar link** |
| User | **Usuário** / **Usuária** |
| Admin | **Administrador** / **Admin** |
| Member | **Membro** |
| Owner | **Dono(a)** ou **Proprietário(a)** |
| Team | **Equipe** ou **Time** |
| Organization | **Organização** |
| Workspace | **Workspace** (anglicismo aceito) ou **Área de trabalho** |
