# Manutenção contínua

> Calendário de OPERATIONS §8. Ajuste itens e responsáveis ao projeto. Registre cada execução no histórico.
> OPERATIONS §8 é o mínimo; onde este calendário é mais frequente (restauração, alertas, incidente), vale o daqui.
> "Crítico" é o sistema que movimenta dinheiro, pedidos ou dados de várias empresas.

| Cadência | Item | Como | Responsável |
|---|---|---|---|
| Semanal | Advisors de segurança e desempenho | painel do Supabase ou `supabase db advisors` | {{...}} |
| Semanal | Dead-letter e itens em `UNKNOWN` | {{consulta}} | {{...}} |
| Semanal | Alertas silenciados ou ruidosos | {{ferramenta}} | {{...}} |
| Semanal | Dependências e segredos (CVE novo aparece sem mudança de código) | `security.yml` agendado verde: `node scripts/security/deps-audit.mjs` (0 P0/P1) e `node scripts/security/secret-scan.mjs --history` | {{...}} |
| Semanal | Análise estática | achados novos do Semgrep (job `sast` do `security.yml`, artefato `semgrep.json`) triados; depois de limpar o ruído, passe a reprovar o que o PR introduz | {{...}} |
| Semanal (crítico) | Auditoria agendada | resumo da execução do `auditoria.yml` (`/saas-audit-br:audit --ci`): P0 novo reprova a execução; P0 persistente tem dono e prazo | {{...}} |
| Mensal | Auditoria dos demais sistemas | `auditoria.yml` com cron mensal (`'7 6 1 * *'`) ou `/saas-audit-br:audit --audit-only` | {{...}} |
| Mensal | Dependências | PRs do Dependabot (cooldown de 7 dias), agrupados, com pipeline verde; major é decisão com plano | {{...}} |
| Mensal | Exceções de segurança | `docs/security/exceptions.json`: vencidas voltam a bloquear o CI; renove com mitigação ou corrija | {{...}} |
| Mensal | Revisão de acessos (Supabase, Vercel, GitHub, Business Manager, Z-API) | lista de quem tem acesso a produção | {{...}} |
| Mensal (crítico) | Teste de restauração dos dados críticos | `docs/runbooks/RECOVERY.md` num projeto separado; anote o RTO e o RPO alcançados de fato | {{...}} |
| Mensal | Alertas chegam | dispare um alerta de teste em cada canal e confirme o recebimento | {{...}} |
| Mensal | Custo por serviço | faturas e painéis | {{...}} |
| Trimestral | Teste de restauração dos demais sistemas | `docs/runbooks/RECOVERY.md`, incluindo arquivos do Storage (o backup do banco não os inclui) | {{...}} |
| Trimestral | Rotação de chaves | {{lista de credenciais}} | {{...}} |
| Trimestral | Privilégios administrativos | Super Admin, service role, chaves de API emitidas e contas de provedor: quem tem, por quê e desde quando | {{...}} |
| Trimestral | LGPD: direitos dos titulares | exportação e exclusão de dados pessoais testadas de ponta a ponta, inclusive em fornecedores | {{...}} |
| Trimestral | Versão de API dos provedores | provider docs (`Última verificação`) | {{...}} |
| Trimestral | Runtime e cópias de segurança | Node do `.nvmrc`/CI/Vercel ainda é LTS com suporte; `scripts/security/` atualizado a partir do saas-shield-br (watchlist com `reviewed_at` recente) | {{...}} |
| Trimestral | Versões fixas que o Dependabot não atualiza | Semgrep no `security.yml`, Supabase CLI no `ci.yml`, `claude-code-action` no `auditoria.yml`, CLI da Vercel no deploy | {{...}} |
| Trimestral | Flags mortas e jobs de retenção | DATABASE §10 | {{...}} |
| Semestral | Simulação de incidente | exercício de mesa com o runbook de incidente: conter, preservar logs, avisar o cliente em até 24 h, prazo da ANPD | {{...}} |
| Semestral | Recuperação completa do ambiente | banco, Storage, Edge Functions, variáveis e domínio, a partir do zero | {{...}} |
| Anual | Inventário LGPD e operadores | SECURITY §10 | {{...}} |
| Anual | Threat model dos módulos críticos | SECURITY §7 | {{...}} |
| Anual | Pentest independente | sistemas críticos, e após mudança de alto impacto | {{...}} |

## Histórico

| Data | Item | Achados | Ação |
|---|---|---|---|
