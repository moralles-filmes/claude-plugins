---
name: dependency-audit
description: 'Audita as dependências npm/pnpm/bun/yarn de um projeto EXECUTANDO o audit: inventário de lockfiles (duplicados), audit com triagem produção × desenvolvimento, versões mínimas dos pacotes dos incidentes de out/2026 (Next, React RSC, sharp, postcss, zod, xlsx, jspdf, dompurify, react-router, tar, vitest, vite), versão de runtime do Node (fim de vida, engines das dependências) e plano de correção na ordem patch → overrides → CDN oficial → major como decisão do usuário. Use no /pre-deploy, ao herdar um projeto, ao receber alerta de CVE/Dependabot, depois de mexer em package.json ou lockfile, ou quando o usuário pedir "npm audit", "tem CVE?", "minhas dependências estão seguras?", "atualizar dependências", "o Next está vulnerável?".'
---

# dependency-audit

Você audita dependências **executando** ferramentas, não lendo o `package.json`. A fonte da verdade é o audit do gerenciador (advisories do GitHub). O script deste plugin junta o audit com uma watchlist que funciona sem rede e diz a correção certa para cada caso.

## Quando rodar

- **Etapa 0 do `/pre-deploy`** (obrigatória) e no fechamento da `padrao-saas:mudanca`.
- Ao receber alerta (GitHub, Dependabot, e-mail do provedor, notícia) de pacote que o projeto pode usar.
- Depois de qualquer mudança em `package.json` ou lockfile, e ao herdar um projeto.
- Toda semana pelo `security.yml` do CI: CVE novo aparece sem mudança de código.

## Passo 1 — Executar

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/security/deps-audit.mjs --root . --report .deps-audit/report.json
```

Em projeto com o kit do Padrão SaaS, o mesmo script está em `scripts/security/deps-audit.mjs`. Ele faz, para cada pasta com lockfile (monorepo incluso):

1. **Lockfiles.** `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`. Mais de um na mesma pasta é **P1**: o CI e a Vercel podem instalar árvores diferentes. Confere com o `packageManager`. Pacote sem lockfile fora de workspace: P2.
2. **Audit do gerenciador, duas vezes** (completo e só produção), para separar prod de dev:

   | Gerenciador | Completo | Só produção |
   |---|---|---|
   | npm | `npm audit --json --package-lock-only` | `… --omit=dev` |
   | pnpm | `pnpm audit --json` | `… --prod` |
   | bun | `bun audit --json` | `… --production` |
   | yarn | não automatizado: rode `yarn npm audit --environment production` (berry) ou `yarn audit --groups dependencies` (v1) | |

3. **Watchlist** (`scripts/security/watchlist.json`, com `reviewed_at`): versões mínimas dos pacotes dos incidentes de out/2026, com a correção (overrides, CDN, major). Funciona com `--no-audit`. O teste do plugin falha quando ela passa de 90 dias sem revisão.
4. **Runtime.** `engines.node`, `.nvmrc`, `.node-version`, `.tool-versions`, `volta.node`, `node-version` dos workflows e `FROM node:` dos Dockerfiles contra o calendário de fim de vida do Node e contra o maior `engines.node` das dependências instaladas (ex.: React Router 7 exige Node ≥ 20; puppeteer novo, ≥ 22.17).

**Resultado:** `exit 0` = PASS ou PASS_WITH_WARNINGS; `exit 1` = FAIL (P0/P1 sem exceção); `exit 2` = **INCONCLUSIVO** (sem lockfile, gerenciador ausente, sem rede, yarn, ou `--no-audit`). Inconclusivo nunca vira PASS: diga o que faltou e como resolver.

Se o npm 10.9.x falhar com `Cannot read properties of null (reading 'edgesOut')`, repita a operação com `npx -y npm@11 <comando>`. O lockfile gerado continua válido para o `npm ci`.

## Passo 2 — Triagem (o script já classifica; confira)

| Achado | Severidade |
|---|---|
| critical em dependência de produção | P0, bloqueia |
| high em produção, ou pacote da watchlist abaixo do mínimo | P1, bloqueia (P0 na watchlist quando é RCE sem login: Next, sharp) |
| critical/high só em dev, mas a ferramenta roda no build da Vercel/CI com os segredos do ambiente (vite, esbuild, babel, postcss, tailwind, next, plugins de build) | P1: para cadeia de suprimentos, build é produção |
| critical/high só em dev, roda só local (vitest, eslint, tinypool) | P2; vira P1 se o servidor da ferramenta fica exposto (`--host`, UI do vitest) |
| moderate em produção | P2 |
| Node em fim de vida no `.nvmrc`/CI/Docker, ou abaixo do que as dependências exigem | P1 |
| lockfiles duplicados | P1 |
| low; moderate só em dev | P3 |

"Só em dev" é o que **não** aparece no audit de produção (`--omit=dev`/`--prod`/`--production`).

## Passo 3 — Corrigir, nesta ordem

1. **Dentro da faixa** (patch/minor): `npm update <pkg>` / `pnpm update <pkg>` / `bun update <pkg>`; confira o diff do lockfile.
2. **Transitiva presa pelo pai** (o Next fixa o postcss): `overrides` (npm e bun), `pnpm.overrides`, `resolutions` (yarn). Restrinja ao pai quando der. Exemplo real, em produção no barbados-atendiai:

   ```json
   "overrides": { "sharp": "^0.35.5", "next": { "postcss": "^8.5.31" } }
   ```
   Prova: `npm ls postcss sharp` só mostra versões corrigidas. No pnpm: `"pnpm": { "overrides": { "next>postcss": "^8.5.31", "sharp": "^0.35.5" } }`.
3. **Pacote abandonado no npm, corrigido no canal oficial do mantenedor** (SheetJS):
   ```bash
   npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
   ```
   O lockfile grava o hash de integridade. O Dependabot não atualiza dependência por URL: anote o pacote na watchlist do projeto (`docs/security/exceptions.json` com prazo de revisão, ou a seção de manutenção).
4. **Correção só numa major** (zod 3 → 4, react-router 6 → 7, Expo 52 → 57, NestJS 10 → 11, Sentry 8 → 11, puppeteer + `@sparticuz/chromium`): **PARE. É decisão do usuário.** Entregue o plano abaixo e espere aprovação explícita. Enquanto não migra: mitigação (ex.: limitar o tamanho do payload antes do `zod.parse`) e exceção com prazo.
5. **Lockfile duplicado:** fique com o do `packageManager`, apague os outros, instale limpo (`npm ci` / `pnpm install --frozen-lockfile` / `bun install --frozen-lockfile`), rode build e testes.
6. **Runtime:** a mesma LTS (22 ou 24) em `engines.node`, `.nvmrc`, `node-version-file: .nvmrc` no CI, `FROM node:` e Vercel (Project Settings → Node.js Version). Subir o Node pode ser pré-requisito de uma major (React Router 7, puppeteer novo): ordene o plano.

Exceção (risco aceito temporariamente) em `docs/security/exceptions.json`:
```json
{ "exceptions": [ { "id": "GHSA-mrhx-c7xc-m3w5", "package": "zod", "reason": "migração para zod 4 agendada", "mitigation": "limite de 100 KB no body antes do parse", "owner": "yuri", "expires": "2026-11-30" } ] }
```
`id` é o GHSA ou o id da watchlist (`watchlist:zod`). Exceção vencida volta a bloquear e gera P2.

## Plano de migração major (entregue isto e espere a decisão)

```
Pacote: <nome> <de> → <para>          Motivo: <GHSA / watchlist>   Em produção? <sim/não, onde>
Breaking changes que nos afetam: <lista, com link do guia oficial>
Codemod/ferramenta: <se houver>       Pré-requisitos: <ex.: Node ≥ 20 para React Router 7>
Passos: 1) branch isolada 2) … 3) pipeline + smoke em preview
Testes que provam: <unit/integração/E2E específicos>
Rollback: <versão anterior do deploy; lockfile anterior>
Esforço estimado: <horas/dias>        Risco de não migrar: <cenário de exploração>
Pergunta: migrar agora / mitigar e agendar até <data> / aceitar o risco até <data>?
```

## Critério de pronto

- `deps-audit.mjs` sai com 0: nenhum P0/P1 sem exceção válida.
- Um lockfile por pasta; instalação frozen passa no CI.
- Runtime declarado é LTS com suporte e atende o maior `engines.node` das dependências.
- lint, typecheck, testes e build passam depois da correção.
- Toda major pendente tem plano entregue e decisão registrada.

## O que esta skill não faz

- Não escolhe sozinha uma major nem roda `npm audit fix --force`.
- Não substitui o Dependabot/Renovate (o `devops-ci` do saas-builder-br e o kit do Padrão SaaS trazem a configuração com cooldown) nem o bloqueio de install scripts (`ignore-scripts`).
