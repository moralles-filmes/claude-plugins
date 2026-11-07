# global/

Configuração pessoal do Claude Code que não cabe num plugin. O `setup-claude` aplica com
`scripts/sync-global.mjs` (rodável sozinho: sem `--apply` só mostra o que faria).

| Arquivo | Vai para | Como |
|---|---|---|
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` | bloco entre `<!-- morallesfilms-local:start -->` e `<!-- morallesfilms-local:end -->`; o resto do arquivo da máquina é preservado e há backup `CLAUDE.md.bak-<data>` antes de escrever |
| `claude/vercel-skills.json` | `~/.claude/skills/<nome>` | `git sparse-checkout` do commit fixado; registro em `~/.claude/skills/.vercel-agent-skills.lock.json`; pasta de mesmo nome não instalada pelo script nunca é tocada |

Para mudar as regras globais, edite `claude/CLAUDE.md` aqui (não direto na máquina: o próximo
setup troca o bloco pela versão do repositório) e rode `node scripts/sync-global.mjs --apply`.
Anotações só desta máquina ficam no `~/.claude/CLAUDE.md`, fora dos marcadores.
