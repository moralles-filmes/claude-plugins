# Prompt inicial — Padrão SaaS v3.2

Cole o bloco abaixo como **primeira mensagem** num projeto, novo ou existente.

- **Claude Code com o plugin `padrao-saas` instalado:** cole como está. Ele aciona `/padrao-saas:aplicar`.
- **Codex ou Claude Code sem o plugin:** troque `<KIT>` pelo caminho do clone do repositório `claude-plugins` na sua máquina (ex.: `~/Documents/claude-plugins`). O agente lê a skill e os arquivos direto de lá.

A primeira sessão termina num relatório e num plano. Nada de código de produto, migration remota ou deploy antes da sua aprovação.

---

```text
Aplique o Padrão SaaS v3.2 neste projeto e prepare a implantação do modelo de acesso.

ONDE ESTÁ O PADRÃO
- Se a skill padrao-saas:aplicar estiver disponível, use-a.
- Se não estiver, leia <KIT>/padrao-saas/skills/aplicar/SKILL.md e siga o procedimento,
  copiando os arquivos de <KIT>/padrao-saas/skills/aplicar/assets/repo/ e usando
  <KIT>/padrao-saas/skills/aplicar/templates/.

ARQUITETURA-ALVO (detalhes em docs/standards/, depois de copiados)
- Monólito modular com Ports & Adapters; mutações críticas em caso de uso no servidor
  (Next: route handler/server action; Vite: Edge Function ou RPC). O banco bloqueia o caminho direto.
- Multiempresa: o mesmo usuário pode ser membro de várias empresas, com papéis diferentes em cada.
- Filiais: dado operacional pertence à filial (company_id + location_id, FK composta);
  cadastros compartilhados pertencem à empresa (company_id).
- Permissões por módulo, submódulo e ação: <modulo>.<submodulo>.<acao>
  (ex.: financeiro.contas_pagar.baixar). Concedidas por papel ou direto ao membro, para a
  empresa inteira ou por filial. Conceder "financeiro" dá o módulo inteiro; conceder
  "financeiro.contas_pagar" dá só Contas a Pagar. Concessões só somam; qualquer ação implica ver.
- A empresa só acessa módulos contratados; empresa inadimplente fica só leitura.
- A empresa ativa vem da URL e é confirmada pela membership no servidor. A RLS (forçada)
  é a cerca; toda query de tela filtra pela empresa e filial ativas.
- Ninguém escreve direto nas tabelas de acesso: concessão passa por caso de uso com regras
  anti-escalada (só concede o que tem, ninguém altera o próprio acesso, sempre há proprietário).
- Implementação de referência testada: templates/sql (00 adapter de identidade, 01 núcleo,
  02 exemplo, 03–04 testes pgTAP). Policies usam private.current_user_id(), nunca auth.uid().
- Portabilidade: a tela chama só o adapter do módulo (features/<m>/api.ts). Meça com
  scripts/check-portabilidade.mjs e grave a linha de base em projeto existente.

REGRAS DESTA SESSÃO
- Rode git status primeiro. Crie a branch chore/padrao-saas. Commits locais pequenos; sem push.
- Produção é somente leitura. Nada de migration remota, deploy ou alteração de variáveis.
- Não altere comportamento funcional nem código de produto nesta sessão.
- Não invente tabela, comando, módulo ou regra de negócio. Marque cada afirmação como
  CONFIRMADO, INFERIDO ou NÃO CONFIRMADO, com evidência (arquivo:linha ou comando).
- Projeto existente: mantenha o modelo de tenant atual e declare-o em
  .claude/tenancy-profile.yml. Trocar de modelo é projeto à parte, com ADR.

ENTREGA (e então pare)
1. Diagnóstico: modo (novo/existente/migração), runtime, stack confirmada, modelo de tenant
   e de permissões atual, nível de maturidade proposto (N1/N2/N3).
2. Arquivos instalados ou ajustados e o que foi movido de onde para onde.
3. Riscos P0–P3 com evidência.
4. Lacunas entre o modelo de acesso atual e o alvo: filial, usuário em várias empresas,
   permissão por submódulo, módulos contratados, anti-escalada, empresa ativa na URL,
   FK composta, RLS forçada.
5. Proposta da árvore de módulos, submódulos e ações e dos papéis de sistema, com as
   dúvidas que só eu posso responder.
6. Plano em fases pequenas e reversíveis, do maior risco para o menor. Para projeto
   existente: expand → backfill → contract, com rollback.
7. O que não foi verificado e por quê.
```

---

## Depois da aprovação

Peça uma fase por vez, por exemplo:

```text
Execute a fase 1 do plano em .tasks/padrao-saas/. Migrations só no Supabase local,
com supabase test db passando. Pare ao final com o relatório de tarefa sensível.
```

Para cada módulo novo: `/padrao-saas:novo-modulo` (ou "crie o módulo X seguindo docs/standards/MODULES.md").
