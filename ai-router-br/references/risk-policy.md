# Política de risco

A classificação é contextual, não apenas por palavras-chave.

- **TIER 0 — crítico**: auth/authz/RLS/RBAC, tenancy/memberships, secrets, pagamentos/billing, migrações de segurança, operações destrutivas/produção, decisões irreversíveis, incidentes e revisão final crítica. Executor: agente principal.
- **TIER 1 — coding**: features, backend/frontend, APIs, CRUD, refactors, bugs e testes complexos. Complexidade inferida `standard` (Codex `gpt-6.1-sol` · low) ou `complex` (Codex `gpt-6.1-sol` · high); com plano mapeado em `steps`, desce um degrau.
- **TIER 2 — cheap worker**: exploração volumosa, inventário, boilerplate, mocks, fixtures, renames mecânicos, documentação e tarefas repetitivas. Complexidade `simple`: DeepSeek, depois Codex `gpt-6-luna`.
- **TIER 3 — mechanical**: classificação, sumarização, busca e organização simples. Complexidade `mechanical`: DeepSeek, depois Codex `gpt-6-luna` · low.

Os tiers 1–3 terminam a escada num subagente Claude (Haiku ou Sonnet), não no principal. A escada completa e os preços estão em `models.md`. Risco e complexidade são eixos separados: declarar `complexity: mechanical` numa tarefa crítica não a tira do TIER 0.

Combinações elevam o risco: `produção + delete/drop/purge`, `segurança + migration`, `pagamento + webhook/estorno` podem tornar a tarefa crítica. Um termo isolado não basta para rebaixar ou elevar cegamente.

Em dúvida, segurança ganha.
