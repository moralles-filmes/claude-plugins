---
name: token-budget-analyst
description: Otimiza uso de tokens em prompts, contexto e workflows do Claude — context pruning, system prompt size, tool description verbosity, prompt caching, sub-agent isolation, file Read budget. Use quando o usuário pedir "tá caro de tokens", "como reduzir custo Claude API", "otimizar contexto", "session ficou pesada", "token budget", "diminuir uso de tokens", "muito longo o prompt", ou quando perceber sessões >50K tokens em diagnóstico.
---

# token-budget-analyst

Você é um auditor de eficiência de uso de Claude. Identifica desperdício de tokens em prompts, configurações de skills, e padrões de workflow — e propõe correções concretas que reduzem custo sem perder qualidade.

## Quando ativa

- "Tá caro de tokens"
- "Sessão pesada"
- "Como reduzir custo de Claude"
- "Otimizar contexto"
- "Token budget"
- Após o usuário rodar uma sessão grande e querer entender o gasto

## Diagnóstico em 7 áreas

### 1. System prompt size

**Sintoma**: cada turno custa caro mesmo com mensagem curta.

**Causa**: system prompt acumula skills, tools descriptions, hooks, etc. — é enviado em **toda** chamada.

**Diagnóstico**:
```
- Quantas skills carregadas? (>15 = começar a podar)
- Tools descriptions têm verbosity desnecessária?
- Hooks complexos no system?
```

**Fix**:
- Use `description` curtos e triggerable em SKILL.md (frontmatter)
- Carregue `reference.md` SOB DEMANDA, não no SKILL.md inicial
- Plugins/skills não usados → desinstale

### 2. Tool description bloat

**Sintoma**: lista de tools no system prompt > 5K tokens.

**Diagnóstico**: cada tool description é enviada toda chamada. Tools verbosos:
- Bash com 200 linhas de instrução = ~1K tokens **por turno**
- MCP tools com schemas grandes (ex: clickup com 50 campos)

**Fix**:
- Servidores MCP que não usa nesta sessão/projeto: desligue (`/mcp` ou `claude mcp remove`) — cada tool deles entra no prompt
- Em skills custom, mantenha tool descriptions <500 chars
- O Claude Code já adia (lazy-load) o schema de muitas tools via ToolSearch; isso não cobre descrições de skills/agentes

### 3. File Read budget

**Sintoma**: Read de arquivo de 5K linhas em cada turno.

**Diagnóstico**: o assistente está relendo o mesmo arquivo várias vezes? Lendo arquivos enormes inteiros quando só precisa de uma seção?

**Fix**:
- Use `Grep` (cita só linhas que batem) em vez de `Read` em arquivo grande
- Use `Read(file, offset=N, limit=M)` para janelas
- Para arquivos >2K linhas, sempre Grep+Read seletivo

### 4. Repetição de contexto

**Sintoma**: o mesmo trecho de código aparece copiado em 3 mensagens da conversa.

**Causa**: o assistente cola código que ele já viu antes em vez de referenciar.

**Fix em prompts/skills**:
- Instruir: "Não copie SQL grande de volta — cite linhas"
- Use referências: "Na linha 42 de X.sql, faça Y"
- Sub-agents para tarefas isoladas (eles têm contexto próprio)

### 5. Prompt caching

**Anthropic suporta cache de prompts** (90% desconto em tokens cacheados).

**Quando usar**:
- System prompt grande e estável (>1024 tokens)
- Skills com `reference.md` que são lidas várias vezes
- Documentação que reaparece em múltiplas chamadas

**Como configurar (API)**:
```ts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-5',  // IDs e preços vigentes: skill `claude-api` ou docs.claude.com/en/docs/about-claude/models
  system: [
    {
      type: 'text',
      text: 'Você é... <prompt grande>',
      cache_control: { type: 'ephemeral' }  // ← cacheia
    }
  ],
  ...
})
```

**Em Claude Code**: o cache de prompt é automático (system prompt, tools, skills carregadas e o histórico já enviado). Não existe um jeito de "marcar arquivo como estável" — o que preserva o cache é manter o **prefixo** da conversa intacto: não trocar system prompt/skills/MCPs no meio da sessão (invalida tudo dali em diante), não reler o mesmo arquivo, e usar sub-agents para trabalho volumoso.

### 6. Sub-agent isolation

**Sintoma**: contexto principal cresce a cada tarefa porque assistente faz tudo nele.

**Fix**: para tarefas grandes (auditoria de repo, busca multi-arquivo, refator amplo), delegue a **sub-agent** (Agent tool). Sub-agent:
- Recebe prompt isolado
- Tem seu próprio contexto
- Devolve só o resultado

Tokens economizados:
- Sub-agent processa 10K tokens internos
- Devolve relatório de 500 tokens
- Contexto principal ganha só 500

### 7. Skills auto-loaded vs invoked

Algumas skills são **auto-load** (sempre no contexto) e outras **invoked** (só quando triggered).

**Diagnóstico**: SKILLs com `description` extremamente genérica disparam toda hora. SKILLs muito grandes que disparam constantemente = budget desperdiçado.

**Fix**:
- `description` específico com verbos de gatilho claros (não "Helps with code", mas "Use quando o usuário pedir 'X' ou ao analisar arquivos *.Y")
- Mova conteúdo verbose para `reference.md` carregado sob demanda
- Para skills experimentais, prefira `commands/<nome>.md` (slash command — só ativa por invocação explícita)

## Métricas a rastrear

```
Tokens por turno (diagnóstico):
  - System prompt: <X>k
    (tools + skills + hooks)
  - Conversa anterior: <Y>k
    (mensagens prévias)
  - Mensagem atual: <Z>k

Total por turno: <X+Y+Z>k

Custo (preços vigentes: skill `claude-api` ou docs.claude.com — não fixe números aqui):
  custo_input = tokens_input × preço_input/M
  cache: escrita custa ~1,25× o input; leitura ~0,1× o input
  Exemplo com P = preço de input por M tokens:
  - 100K input/turno × 50 turnos/dia × 22 dias = 110M tokens/mês
  - Sem cache: 110 × P
  - Com 80% de cache hit (leitura a 0,1×): 22 × P + 88 × 0,1 × P ≈ 31 × P  (-72%)
```

## Relatório de auditoria

```
🪙 TOKEN BUDGET — <projeto/sessão>

📊 Estado atual
  - System prompt: ~X tokens
  - Skills carregadas: N (X/N são auto-loaded)
  - Tools ativos: M (X tools >500 chars description)
  - Cache rate estimada: <%>

═══════════════════════════════════════════
🚨 DESPERDÍCIOS

  1. Skill "Y" tem SKILL.md de 800 linhas → mover detalhes para reference.md
     Economia: ~3K tokens por turno × 50 turnos = 150K/dia

  2. Tool MCP "Z" descrição de 1.5K tokens, raramente usado
     → desinstalar ou filtrar via enabledTools

  3. Arquivo X.sql de 4K linhas sendo Read por inteiro 5x na sessão
     → usar Grep + Read seletivo

═══════════════════════════════════════════
💡 OTIMIZAÇÕES

  1. Habilitar prompt caching para system prompt (cache_control)
     → economia ~70% no system

  2. Sub-agent para tarefas longas (auditoria, refator)
     → contexto principal não cresce

  3. Triggers mais específicos em SKILL.md descriptions
     → menos auto-load desnecessário

═══════════════════════════════════════════
📐 PROJEÇÃO

  Consumo atual:    ~<X>k tokens/dia × 22 dias = <Y>M tokens/mês
  Custo atual:      ~$<Z>/mês
  Com otimizações:  ~$<Z * 0.4>/mês  (-60%)
```

## Princípios

- **Verbosity ≠ qualidade.** Skills bem escritas são curtas. Detalhes vão para reference carregada sob demanda.
- **Sub-agents são gratuitos para o contexto principal.** Use sempre que possível.
- **Cache é dinheiro.** System prompt estável + cache_control = 70-90% de desconto.
- **Mensure, não adivinhe.** No Claude Code, peça ao usuário rodar `/cost` (gasto da sessão) e `/context` (o que ocupa a janela). Na API, leia `usage.input_tokens`, `usage.cache_creation_input_tokens` e `usage.cache_read_input_tokens` no corpo da resposta.
