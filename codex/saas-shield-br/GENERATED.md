# SaaS Shield BR — versão Codex (gerada)

Gerada de `../../saas-shield-br/` por `scripts/build-codex-plugins.mjs`. Não edite à mão: mude o plugin Claude e rode `node scripts/build-codex-plugins.mjs`.

- Agentes e comandos do Claude Code viram skills (o manifesto Codex só tem `skills`).
- `hooks/hooks.json` não é usado aqui: os bloqueios automáticos do Claude Code não existem nesta versão.
- Para bloquear commit e push com segredo também no Codex (e para quem commita no terminal), instale no projeto os `.githooks/pre-commit` e `pre-push` do kit do padrao-saas, que chamam `scripts/security/secret-scan.mjs`, e o `security.yml` no CI.
