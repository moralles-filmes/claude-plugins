# Contexto do projeto para agentes

> Entrada única para Claude Code (via `CLAUDE.md` → `@AGENTS.md`) e Codex. Padrão SaaS v3.2.
> Contém só o que todo agente precisa antes de tocar no sistema. Detalhes ficam em `docs/standards/`.
> Meta: menos de 200 linhas. Não transformar em diário, changelog ou plano de tarefa.

## 1. Projeto

- Produto: {{o que é, em uma frase}}
- Usuários: {{quem usa}}
- Criticidade: {{ex.: movimenta dinheiro; envia WhatsApp para clientes finais; guarda dados pessoais}}
- Modo: {{existente | novo | migração}}
- Nível de maturidade: {{N1 | N2 | N3}} — ver §5

## 2. Stack, runtime e fontes de verdade

- {{Next.js x.y (App Router) | Vite x.y + React}}, TypeScript, Supabase (Postgres, Auth, Storage), Vercel
- Runtime de servidor: {{Next (route handlers/server actions) | Vite SPA + Edge Functions/RPC}} — ARCHITECTURE §2
- Package manager: {{pnpm | npm}} — lockfile `{{arquivo}}` é canônico.
- Supabase: projeto dev `{{ref}}`, produção `{{ref}}` (só referências, nunca chaves).
- Ordem de confiança: código e banco vivo > manifests > documentação. Se a documentação divergir do código, reporte a divergência em vez de segui-la às cegas.

## 3. Arquitetura resumida

- Monólito modular com Ports & Adapters. Módulos em `{{src/modules/<modulo> | src/features/<modulo>}}`.
- Execução: interface → caso de uso → porta → adapter. Domínio e casos de uso não importam SDKs, `supabase-js` ou framework.
- A tela chama só o adapter do módulo ({{src/features/<modulo>/api.ts | adapters/}}): nunca importa o cliente Supabase nem chama `.from()`/`.rpc()` direto (GCP_MIGRATION §6).
- Mutações críticas passam por caso de uso no servidor ({{route handler/server action | Edge Function}} ou RPC). O banco bloqueia o caminho direto (SECURITY §5).
- Trabalho assíncrono durável roda em: {{ex.: outbox + pg_cron acionando Edge Function | Supabase Queues | Vercel Cron}}. `after()`/`waitUntil` só para trabalho descartável.
- Estado compartilhado (rate limit, locks, circuit breaker) fica no Postgres, salvo decisão registrada em ADR.

## 4. Modelo de acesso

- Declarado em `.claude/tenancy-profile.yml` (fonte única para agentes e plugins). Arquétipo: {{E — company_id + location_id + permissões por módulo | A/B/C/D}}.
- Empresa (`{{company_id}}`) → filial (`{{location_id}}`) → dados. O mesmo usuário pode ser membro de várias empresas, com papéis diferentes em cada uma.
- Permissões `<modulo>.<submodulo>.<acao>`, concedidas por papel ou direto ao membro, para a empresa inteira ou por filial. Só somam; qualquer ação implica `ver`. A empresa só acessa módulos contratados.
- A empresa ativa vem da **URL**, confirmada pela membership no servidor. A RLS é a cerca (todas as empresas do usuário); toda query de tela filtra pela empresa ativa e, quando aplicável, pela filial.
- Detalhes: ACCESS_CONTROL.md e MULTI_TENANCY.md.

## 5. Como aplicar os padrões

As regras dos padrões são marcadas com nível:

- **[N1] Base:** vale sempre que o fluxo protegido existir.
- **[N2] Operação crítica:** vale quando o projeto está em N2 ou acima.
- **[N3] Escala:** vale em N3 ou quando houver necessidade medida.

Um requisito se aplica quando o fluxo que ele protege existe **e** o nível do projeto alcança o nível da regra. Os controles N1 de um fluxo existente nunca são dispensados.

Não adicione infraestrutura, troque a stack ou amplie escopo só para preencher checklist. Em tarefas sensíveis, classifique os requisitos relevantes como APLICÁVEL, NÃO APLICÁVEL (com justificativa objetiva) ou PENDENTE.

## 6. Segurança — vale em toda tarefa

- **Tenant.** O tenant da operação vem da sessão validada mais a membership, **nunca** do body, da query, do payload de webhook ou do argumento de uma tool. Registros relacionados pertencem ao mesmo tenant (FK composta, MULTI_TENANCY §5).
- **Autorização.** Fica no servidor e no banco (RLS forçada, grants, `can()`); o frontend só melhora UX. Não desabilite nem afrouxe RLS, policy ou grant para "fazer funcionar".
- **Acessos.** Ninguém escreve direto nas tabelas de acesso. Concessão passa pelo caso de uso com as regras anti-escalada (ACCESS_CONTROL §6).
- **Credenciais privilegiadas.**
  - Service role / secret key (ignora RLS) e tokens de provedor ficam apenas no servidor.
  - Antes de usar a service role, resolva o tenant, verifique a permissão e filtre a coluna de tenant explicitamente em toda query.
  - A publishable/anon key pode ir ao browser porque a proteção vem de RLS e grants.
- **Segredos.** Nunca em Git, browser, logs, traces, mensagens de erro, prompts de IA, resultados de tool ou documentação.
- **Efeitos reais.** Testes, CI e **preview deployments** nunca disparam mensagens, e-mails, cobranças ou webhooks reais.
- **Produção.** Deploy, push, merge, migration remota e alteração destrutiva exigem autorização explícita nesta conversa. Uma autorização vale para o mesmo escopo e ambiente até a tarefa terminar; mudança de escopo ou ambiente exige nova autorização. Commit local em branch de trabalho é livre (OPERATIONS §1).

## 7. Comandos oficiais

```text
install:    {{pnpm install --frozen-lockfile}}
dev:        {{pnpm dev}}
lint:       {{pnpm lint}}
typecheck:  {{pnpm typecheck}}
test:       {{pnpm test}}
test db:    {{supabase test db}}
build:      {{pnpm build}}
padrão:     node scripts/check-padrao.mjs
portável:   node scripts/check-portabilidade.mjs
db local:   {{supabase start / supabase db reset}}   (nunca contra produção)
```

## 8. Roteador de documentação

Leia este arquivo e, depois, só o que a tarefa exige. Se a tarefa toca vários assuntos, leia a união.

| Tarefa | Ler |
|---|---|
| Texto, estilo ou ajuste local simples | o código afetado; `docs/modules/<modulo>.md` se existir |
| Bug funcional | documento do módulo + testes relacionados; TESTING §2 |
| Módulo ou submódulo novo, mudança de contrato, remoção | `MODULES.md` + `ARCHITECTURE.md` + `ACCESS_CONTROL.md` |
| Refactor | `ARCHITECTURE.md` |
| Permissão, papel, convite, filial, menu por permissão | `ACCESS_CONTROL.md` + `MULTI_TENANCY.md` |
| Auth, sessão, RLS, dados pessoais, audit log | `SECURITY.md` + `MULTI_TENANCY.md` |
| Migration, RPC, índice, query, backup, retenção | `DATABASE.md` + `MULTI_TENANCY.md` |
| Cadastro de empresa, planos, cobrança, suspensão, exclusão | `TENANT_LIFECYCLE.md` + `ACCESS_CONTROL.md` |
| API externa, webhook, OAuth, Meta, Z-API, e-mail, pagamento, IA com tools, MCP | `INTEGRATIONS.md` + `docs/integrations/providers/<provider>.md` + `SECURITY.md` |
| API pública ou chaves emitidas para clientes | `PUBLIC_API.md` + `ACCESS_CONTROL.md` |
| Lentidão, cache, bundle | `PERFORMANCE.md` |
| Testes, CI | `TESTING.md` |
| Deploy, ambientes, logs, incidente, Git, manutenção, upgrade | `OPERATIONS.md` + runbook correspondente |
| Infraestrutura, Docker, Google Cloud | `GCP_MIGRATION.md` + `OPERATIONS.md` |

Não carregue documentos sem relação com o escopo. Também não omita um documento necessário para economizar contexto.

## 9. Como trabalhar

1. Investigue antes de alterar: fluxo, contratos, testes, banco, tenant, permissões e integrações envolvidos.
2. Planeje a menor mudança correta, preservando o comportamento fora do escopo. Nada de refactor paralelo, segunda arquitetura ou abstração prematura.
3. Valide de forma proporcional ao risco, com os comandos oficiais.
4. Nunca declare como testado algo que não foi executado. Use:
   ```text
   NÃO EXECUTADO — Motivo: … Impacto: … Como validar: …
   ```

## 10. Continuidade

- Em tarefa complexa, mantenha `.tasks/<slug>/STATE.md` com: objetivo, decisões, arquivos alterados, o que não foi commitado, testes executados, riscos, pendências e próximo passo. Atualize ao concluir cada fase.
- Ao retomar uma sessão ou depois de compactação, **confira o STATE.md contra `git status` e `git diff`** antes de continuar. Retome pelo próximo passo confirmado, não pela memória da conversa.
- Estado de ferramentas (todos fora do Git): `.tasks/` (este padrão), `.saas-audit/` (auditoria), `.turbo/` (performance), `.ai-router/` (roteamento), `.claude/saas-state.json` (construção). Ao retomar, leia o da ferramenta em uso.
- Onde guardar conhecimento:
  - temporário → `.tasks/`;
  - regra durável de um assunto → "Particularidades" do padrão ou doc do módulo;
  - decisão arquitetural → `docs/adr/`;
  - regra que todo agente precisa em toda tarefa → este arquivo;
  - nada durável → não documente.

## 11. Encerramento

- **Tarefa simples:** o que mudou + validação executada.
- **Tarefa sensível** (dados, permissões, dinheiro, integrações, produção), com estas seções:
  - Alterado
  - Preservado
  - Validação (só o que rodou)
  - Segurança
  - Desempenho (antes/depois ou NÃO MEDIDO)
  - Documentação (o que foi atualizado ou "nenhuma atualização necessária")
  - Pendências reais
- Riscos e achados usam a escala P0 (bloqueia) · P1 (alto) · P2 (médio) · P3 (baixo), com evidência e marcados como CONFIRMADO, INFERIDO ou NÃO CONFIRMADO.

## 12. Invariantes críticas deste projeto

<!-- Só regras de negócio confirmadas que não se deduzem com segurança do código. Remova esta seção se não houver. -->
- {{ex.: lançamento financeiro baixado não é editado; correção é por estorno}}
