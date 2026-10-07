@AGENTS.md

## Específico do Claude Code

- As regras em `.claude/rules/` são carregadas automaticamente quando você lê ou edita arquivos dos caminhos indicados nelas. Elas resumem os pontos críticos e apontam para `docs/standards/`, sem substituir esses documentos.
- `.claude/settings.json` bloqueia ou pede confirmação para ações irreversíveis e de produção. Não tente obter o mesmo efeito por outro comando ou ferramenta: se uma ação foi bloqueada, explique o que precisa e peça autorização.
- `.claude/tenancy-profile.yml` declara o modelo de tenant e de acesso. Os plugins saas-shield-br, saas-builder-br e saas-audit-br leem o mesmo arquivo.
- Use plan mode antes de alterar {{áreas críticas: ex. src/modules/financeiro, supabase/migrations}}.
- Se o `/doctor` sugerir enxugar este arquivo ou o AGENTS.md, não aceite cortes nas seções de segurança, modelo de acesso e invariantes.
