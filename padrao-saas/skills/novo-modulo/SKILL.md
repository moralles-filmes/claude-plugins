---
name: novo-modulo
description: 'Cria um módulo ou submódulo novo num SaaS que segue o Padrão SaaS — árvore de permissões, migrations com tenant/filial e RLS, testes de isolamento, casos de uso, telas guiadas por permissão, doc do módulo e Definition of Done. Use quando o usuário pedir para criar, adicionar ou começar um módulo, submódulo, área ou funcionalidade de negócio nova (ex.: "criar o módulo de estoque", "adicionar contas a receber no financeiro"), ou para remover um módulo. Pressupõe o padrão instalado (docs/standards/MODULES.md); se não estiver, use padrao-saas:aplicar antes.'
---

# Novo módulo — Padrão SaaS v3.2

Você vai executar o procedimento de `docs/standards/MODULES.md` do projeto. Leia esse documento, `ACCESS_CONTROL.md`, `ARCHITECTURE.md` e `.claude/tenancy-profile.yml` antes de começar. Se o projeto não tem `docs/standards/`, pare e sugira `padrao-saas:aplicar`.

Mantenha `.tasks/modulo-<chave>/STATE.md` atualizado a cada etapa (AGENTS.md §10), no formato da skill `padrao-saas:mudanca`. Ao retomar ou depois de compactação, siga a Etapa 0 dela. As Etapas 2 a 4 rodam fora da conversa principal (ver Delegação, no fim).

## Etapa 1 — Escopo e árvore de permissões (pare para aprovação)

1. Leia os módulos existentes (`docs/modules/`, catálogo `permissions` nas migrations) para não duplicar responsabilidade.
2. Escreva `docs/modules/<modulo>.md` a partir de `docs/modules/_TEMPLATE.md` com: responsabilidade, o que não é dele, submódulos, ações, tabelas (da empresa ou da filial), invariantes, integrações e dependências.
3. Proponha a árvore de permissões:

   ```text
   estoque                      módulo
   ├── estoque.produtos         ver · editar
   └── estoque.movimentos       ver · criar · estornar
   ```

   e quais papéis de sistema recebem o quê.
4. Liste as regras de negócio que você **não** consegue confirmar pelo código e pergunte. Não invente regra.

**Pare** e peça aprovação da árvore, das tabelas (empresa x filial) e das invariantes. Elas viram migration e são caras de mudar depois.

## Etapa 2 — Banco (local)

1. Migration de catálogo: `app_modules`, `permissions` e concessões aos papéis de sistema aprovados.
2. Migrations das tabelas seguindo o arquétipo do profile. No arquétipo E:
   - tabela da empresa: `company_id`, policies com `private.allowed_company_ids('<sub>.ver')`; alteração de cadastro compartilhado com `(…editar, true)`;
   - tabela da filial: `company_id` + `location_id`, FK composta para `locations`, policies com `private.allowed_location_ids('<sub>.ver')`;
   - FKs compostas para tudo que é do mesmo tenant; RLS habilitada e forçada; `with check`;
   - transição crítica sem grant de update na coluna de estado; RPC ou caso de uso que confere a ação;
   - grants explícitos (`revoke all … from anon, authenticated` e depois só o necessário): não dependa dos default privileges do Supabase;
   - usuário da requisição por `(select private.current_user_id())` e FK de usuário para `public.app_users`, nunca `auth.uid()`/`auth.users` direto.
   Use `02_exemplo_modulo_financeiro.sql` da skill `padrao-saas:aplicar` (pasta `templates/sql/`) como referência.
3. Testes pgTAP em `supabase/tests/database/<modulo>.test.sql` com a matriz de ACCESS_CONTROL §10 aplicável ao módulo: outra empresa, outra filial, outro submódulo, ação sem permissão, só `editar` vê, módulo não contratado, empresa `read_only`, update direto de estado.
4. Rode `supabase db reset` e `supabase test db` localmente. Regere o tipo TypeScript das permissões.
5. Se o saas-shield-br estiver instalado, peça revisão ao `migration-validator` ou `rls-auditor` e trate os bloqueantes.

Nada de migration remota. Isso é decisão do usuário depois da etapa 5.

## Etapa 3 — Casos de uso

- Commands na ordem de ARCHITECTURE §5, com `can(ctx, '<modulo>.<sub>.<acao>', locationId)` antes da transação, validação de input em runtime, idempotência quando houver efeito externo, auditoria das ações sensíveis.
- Queries com projeção explícita, paginação, filtro pela empresa ativa e pela filial quando aplicável.
- No runtime Vite, os commands críticos são Edge Functions ou RPC; leituras simples podem ir pelo `supabase-js` sob RLS, **dentro de `src/features/<modulo>/api.ts`** (o adapter do módulo). Hooks e componentes chamam o `api.ts`, nunca o cliente Supabase.
- Integrações seguem INTEGRATIONS.md e o provider doc.
- Testes de unidade com portas falsas.

## Etapa 4 — Interface

- Rotas sob a empresa ativa (`/app/[empresa]/<modulo>/<sub>`), e sob a filial quando a tela opera numa filial.
- Item de menu e botões a partir de `my_permissions`; módulo não contratado aparece como tal.
- Formulário validado com o mesmo schema do servidor.
- Quatro estados em toda tela: carregando, vazio, erro, sem permissão.
- Chaves de cache começando por `company_id`.

## Etapa 5 — Fechamento

1. Flag ou plano que libera o módulo; empresas piloto.
2. Doc do módulo atualizado; ADR para decisão não óbvia.
3. Rode os comandos oficiais (lint, typecheck, testes, `supabase test db`, build), `node scripts/check-padrao.mjs` e `node scripts/check-portabilidade.mjs` (o módulo novo não pode aumentar a linha de base).
4. Entregue o relatório de tarefa sensível (AGENTS.md §11) com a Definition of Done de MODULES §5, cada item APLICÁVEL, NÃO APLICÁVEL (com justificativa) ou PENDENTE.

## Submódulo num módulo existente

Mesmas etapas, mais curtas: árvore do submódulo (aprovação), migration de catálogo + tabelas + testes, casos de uso, telas, doc. Quem já tem o módulo inteiro recebe o submódulo automaticamente; confirme com o usuário se isso é desejado e, se não, documente o motivo.

## Remoção de módulo

Siga MODULES §4 na ordem, parando para aprovação antes de desligar o módulo para clientes e antes de qualquer remoção de dados.

## Delegação

A conversa principal fica com a Etapa 1 (aprovação), a verificação de cada etapa e a Etapa 5. As Etapas 2, 3 e 4 rodam cada uma com contexto limpo, escolhendo o executor na ordem da skill `padrao-saas:mudanca` (Etapa 2):

- com o ai-router-br: cada etapa passa pela `ai-router-br:route`, e o risco crítico (banco, RLS, permissões) fica com você;
- com o saas-builder-br: Etapa 2 → `db-schema-designer`; Etapa 3 → `backend-supabase` (e `integrador-apis` se houver integração); Etapa 4 → `frontend-react` (e `design-ux` para componentes); testes → `qa-testes`;
- sem nenhum dos dois: subagente de uso geral; sem subagentes, execute e use a fronteira de sessão da `padrao-saas:mudanca` (Etapa 3).

Cada delegação recebe a árvore aprovada, `docs/modules/<modulo>.md`, os padrões da etapa e o caminho do STATE.md, não a conversa. Os especialistas de banco, servidor e tela do saas-builder-br não têm shell: `supabase db reset`, `supabase test db` e os comandos oficiais rodam com você (ou no `qa-testes`) antes de fechar a etapa. Feche cada etapa no STATE.md. Se a conversa principal já estiver longa, sugira `/clear` e retomar pelo STATE.md.
