# Manutenção contínua

> Calendário de OPERATIONS §8. Ajuste itens e responsáveis ao projeto. Registre cada execução no histórico.

| Cadência | Item | Como | Responsável |
|---|---|---|---|
| Semanal | Advisors de segurança e desempenho | painel do Supabase ou `supabase db advisors` | {{...}} |
| Semanal | Dead-letter e itens em `UNKNOWN` | {{consulta}} | {{...}} |
| Semanal | Alertas silenciados ou ruidosos | {{ferramenta}} | {{...}} |
| Semanal | Dependências e segredos (CVE novo aparece sem mudança de código) | `security.yml` agendado verde: `node scripts/security/deps-audit.mjs` (0 P0/P1) e `node scripts/security/secret-scan.mjs --history` | {{...}} |
| Mensal | Dependências | PRs do Dependabot (cooldown de 7 dias), agrupados, com pipeline verde; major é decisão com plano | {{...}} |
| Mensal | Exceções de segurança | `docs/security/exceptions.json`: vencidas voltam a bloquear o CI; renove com mitigação ou corrija | {{...}} |
| Mensal | Revisão de acessos (Supabase, Vercel, GitHub, Business Manager, Z-API) | lista de quem tem acesso a produção | {{...}} |
| Mensal | Custo por serviço | faturas e painéis | {{...}} |
| Trimestral | Teste de restauração | `docs/runbooks/RECOVERY.md` | {{...}} |
| Trimestral | Rotação de chaves | {{lista de credenciais}} | {{...}} |
| Trimestral | Versão de API dos provedores | provider docs (`Última verificação`) | {{...}} |
| Trimestral | Runtime e cópias de segurança | Node do `.nvmrc`/CI/Vercel ainda é LTS com suporte; `scripts/security/` atualizado a partir do saas-shield-br (watchlist com `reviewed_at` recente) | {{...}} |
| Trimestral | Flags mortas e jobs de retenção | DATABASE §10 | {{...}} |
| Anual | Inventário LGPD e operadores | SECURITY §10 | {{...}} |
| Anual | Threat model dos módulos críticos | SECURITY §7 | {{...}} |

## Histórico

| Data | Item | Achados | Ação |
|---|---|---|---|
