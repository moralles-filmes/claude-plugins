---
description: Gera nova migration Supabase no arquétipo do projeto (padrão E do Padrão SaaS) — conduz a skill supabase-migrator, único gerador de migration dos plugins
argument-hint: "<descrição da mudança em PT-BR>"
---

Crie uma nova migration Supabase.

## Como proceder

1. **Use a skill `supabase-migrator`** com a descrição em `$ARGUMENTS`. Ela é o único template de migration: não escreva SQL de outro modelo aqui.
   - Projeto com `docs/standards/`: a skill lê DATABASE, MULTI_TENANCY e ACCESS_CONTROL do projeto, que prevalecem.
   - Ela resolve o `.claude/tenancy-profile.yml` (skill `tenant-model`). Projeto novo sem profile: arquétipo E, confirmado com o usuário.

2. **Se a descrição faltar ou for vaga**, pergunte só o que a skill pede: tabela, módulo/submódulo, dado da empresa ou da filial, colunas e FKs, transições de estado críticas, chaves de permissão novas.

3. **Apresente** o que a skill devolve: SQL, nome do arquivo, resumo em 3 bullets, autovalidação contra o `rls-reviewer` e o teste pgTAP dos cenários de isolamento.

4. **Próximos passos — sempre locais:**
   ```bash
   supabase migration new <descricao>   # cria supabase/migrations/<timestamp>_<descricao>.sql; cole o SQL
   supabase db reset                    # aplica as migrations no banco LOCAL (Docker)
   supabase test db                     # pgTAP, incluindo os testes de isolamento
   supabase db lint                     # e os Advisors de segurança/desempenho no Studio local
   ```
   Depois: `/check-rls <arquivo>`, commit e PR.

5. **Remoto não é passo de teste.** `supabase db push` aplica no projeto **linkado** (staging/produção). Só acontece depois do merge, pelo pipeline ou com **autorização explícita** do usuário, conferindo antes com `supabase db push --dry-run`. Não rode nem sugira `db push` para "aplicar local".

6. **Antes de finalizar**, ofereça o agente `migration-validator` para validação independente.

## Entrada do usuário

`$ARGUMENTS` — descrição em PT-BR. Exemplos:
- "Contas a pagar da filial com fornecedor, valor e vencimento"
- "Cadastro de fornecedores da empresa"
- "Baixa de conta a pagar só por RPC"
- "Relação N:N entre produtos e etiquetas"
