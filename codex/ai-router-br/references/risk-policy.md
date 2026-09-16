# Política de risco

A classificação é contextual, não apenas por palavras-chave.

- **TIER 0 — crítico**: auth/authz/RLS/RBAC, tenancy/memberships, secrets, pagamentos/billing, migrações de segurança, operações destrutivas/produção, decisões irreversíveis, incidentes e revisão final crítica. Executor: agente principal.
- **TIER 1 — coding**: features, backend/frontend, APIs, CRUD, refactors, bugs e testes complexos. Preferência: Codex por assinatura; fallback DeepSeek quando Codex estiver realmente indisponível/limitado.
- **TIER 2 — cheap worker**: exploração volumosa, inventário, boilerplate, mocks, fixtures, renames mecânicos, documentação e tarefas repetitivas. Preferência: DeepSeek.
- **TIER 3 — mechanical**: classificação, sumarização, busca e organização simples. Preferência: DeepSeek.

Combinações elevam o risco: `produção + delete/drop/purge`, `segurança + migration`, `pagamento + webhook/estorno` podem tornar a tarefa crítica. Um termo isolado não basta para rebaixar ou elevar cegamente.

Em dúvida, segurança ganha.
