# frontend-premium-br

Sites premium, 3D e animações cinematográficas, dentro do Padrão SaaS. O plugin fica disponível em qualquer projeto e só entra em ação quando o pedido pede esse estilo.

## O que vem no plugin

| Peça | Tipo | Uso |
|---|---|---|
| `futuristic-web-design` | skill | Direção de arte, WebGL/R3F, scroll storytelling, tipografia cinética, shaders, microinterações, com orçamento de performance e acessibilidade. Ativa sozinha quando o pedido fala em site/landing 3D, futurista, imersivo ou cinematográfico. Chamada explícita: `/frontend-premium-br:futuristic-web-design`. |
| `web-animation-design` | skill | Curvas, durações, springs e reduced-motion para UI (cópia MIT de `vercel-labs/open-agents`, ver `skills/web-animation-design/NOTICE.md`). Vale também nas telas do app. |
| `magicui` | MCP | `@magicuidesign/mcp@2.0.0` — busca componentes Magic UI. Só faz GET em `magicui.design`, sem chave. |
| `shadcn` | MCP | `shadcn@4.22.1 mcp` — busca e instala itens de registros shadcn (inclusive React Bits) a partir do `components.json` do projeto. |

Referências sob demanda em `skills/futuristic-web-design/references/`:

- `catalogo.md`: as 10 bibliotecas (React Bits, Three.js, R3F, Drei, GSAP, Lenis, Magic UI, Motion Primitives, R3F Scroll Rig, React Postprocessing), com versões, peers, licenças e docs oficiais;
- `receitas.md`: Lenis+GSAP, pin/scrub, cena 3D lazy com fallback, efeito magnético, shader e bloom;
- `orcamento-e-a11y.md`: como medir, orçamento, fallbacks, checklist de acessibilidade;
- `react-bits-shadcn.md`: registro React Bits no `components.json`, uso pelo MCP e revisão do código copiado.

## Relação com o Padrão SaaS

- **Escopo:** site público, landing, página de produto. As telas operacionais do app seguem o `design-ux` (saas-builder-br) e o `web-animation-design`; 3D e scroll sequestrado não entram nelas.
- **Dependências:** bibliotecas de execução (three, R3F, GSAP, Lenis, motion…) são instaladas **por projeto**, com versão exata e o lockfile do projeto, e registradas como decisão (ARCHITECTURE §11; ADR em N2+). Nada é instalado globalmente.
- **Portabilidade:** código de efeito visual não fala com Supabase; dado da tela continua no adapter `features/<m>/api.ts`.
- **Precedência:** lentidão medida → `turbo`; mudança em várias camadas → `padrao-saas:mudanca`.

## Skills complementares no escopo pessoal (fora do plugin)

`vercel-labs/agent-skills` não tem arquivo de licença no repositório, então não vai embutido aqui. Quatro skills dele ficam em `~/.claude/skills/`, copiadas do commit `1a2c79d` (registro em `~/.claude/skills/.vercel-agent-skills.lock.json`):

`vercel-react-best-practices`, `web-design-guidelines`, `vercel-react-view-transitions`, `vercel-composition-patterns`.

Ficaram de fora de propósito: `vercel-optimize` (sobrepõe turbo/cost-optimizer), `deploy-to-vercel` e `vercel-cli-with-tokens` (sobrepõem devops-ci/vercel-deploy-guard), `writing-guidelines` e `react-native-skills` (fora do escopo).

Numa máquina nova, o `setup-claude` instala essas skills sozinho (passo `scripts/sync-global.mjs`, que lê `global/claude/vercel-skills.json` na raiz do repositório). Para só esse passo: `node scripts/sync-global.mjs --apply`. Para trocar o commit, edite o JSON e rode de novo.

A skill oficial `frontend-design` vem do plugin `frontend-design@claude-plugins-official`, já instalado pelo `setup-claude`.

## Testar num projeto

1. `/mcp` deve listar `plugin:frontend-premium-br:magicui` e `plugin:frontend-premium-br:shadcn` como conectados.
2. Peça: "liste 5 componentes de texto animado do Magic UI" → o MCP `magicui` responde.
3. Num projeto com `components.json` e o registro `@react-bits`: "mostre o item SplitText-TS-TW do React Bits" → o MCP `shadcn` responde.
4. Peça "landing page 3D futurista para X" → a skill `futuristic-web-design` é carregada. Peça "crie a tela de contas a pagar" → ela **não** deve ser carregada.

## Atualizar e remover

- Plugin: `claude plugin marketplace update morallesfilms-local` + `claude plugin update frontend-premium-br@morallesfilms-local`, depois reinicie.
- Versões dos MCPs: edite `.mcp.json` (prefira versão publicada há 14+ dias), suba a versão do plugin e registre no CHANGELOG.
- `web-animation-design`: ver `NOTICE.md`.
- Remover: `claude plugin uninstall frontend-premium-br@morallesfilms-local`; as skills Vercel saem apagando as quatro pastas listadas no lock e o próprio lock em `~/.claude/skills/`; a linha 6 da precedência e a seção Frontend saem de `global/claude/CLAUDE.md` (o setup propaga para as máquinas).
