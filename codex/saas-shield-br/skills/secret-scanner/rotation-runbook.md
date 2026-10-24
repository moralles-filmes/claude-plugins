# Runbook — secret vazado (código, `.env`, bundle ou histórico do Git)

Use quando o `secret-scan.mjs`, o hook, o `secret-hunter`, o gitleaks ou um alerta do GitHub/provedor apontar uma chave real. A ordem não muda: **provedor primeiro, histórico por último**. Tirar a chave do código atual não resolve nada: quem clonou, fez fork, viu o PR ou leu o bundle já tem a chave.

## 0. Antes de tudo

- **Não repita o valor** em chat, issue, PR, commit, log ou terminal que guarda histórico. Cite só o caminho, o commit e o tipo (`supabase-service-role-jwt`, `google-api-key`…).
- Avise o usuário que é incidente (P0) e confirme quem tem acesso ao painel do provedor. Rotação real de credencial **não é automatizada** pelos plugins: o usuário executa ou autoriza cada passo.
- Anote o horário de início. Ele entra no registro do incidente.

## 1. Conter no provedor

| Chave | O que fazer |
|---|---|
| Supabase `service_role` **legada (JWT)** | Ela não é trocada sozinha. Caminho recomendado: no painel do projeto (Project Settings → API Keys), crie as chaves novas (`sb_secret_…` para servidor, `sb_publishable_…` para cliente), troque em todos os lugares (passo 2), faça deploy e **desative as chaves JWT legadas**. Alternativa mais rápida e mais disruptiva: gerar um novo JWT secret (Project Settings → JWT Keys), que invalida anon, service_role e todas as sessões de usuário: todo mundo desloga e todo cliente precisa da anon nova (inclusive app mobile publicado). Confira os nomes atuais dos menus na documentação do Supabase antes de executar. |
| Supabase `sb_secret_…` | Revogue a chave no painel e crie outra. As demais continuam valendo. |
| Supabase `sbp_…` (personal access token) | Revogue em Account → Access Tokens. Dá acesso a todos os projetos da conta. |
| OpenAI, Anthropic, Gemini/Google, DeepSeek | Revogue a chave no console do provedor e emita outra. Confira o uso/custo do período: chave de LLM vazada vira fatura. Chave do Google: restrinja por API e por domínio/app. |
| WhatsApp: Meta (Cloud API) | Gere novo token do System User / revogue o antigo; troque o App Secret se ele vazou (ele valida o HMAC do webhook). |
| WhatsApp: Z-API | Gere novo token da instância e, se usado, novo Client-Token de segurança da conta. |
| Stripe | Rotacione a secret/restricted key no Dashboard (permite prazo de expiração da antiga); `whsec_` → role o signing secret do endpoint. |
| GitHub (`ghp_`, `github_pat_`…) | Revogue em Settings → Developer settings. Token de GitHub App: regenere a private key. |
| npm (`npm_…`) | Revogue em npmjs.com → Access Tokens e confira se houve publicação que você não fez. |
| Vercel token | Revogue em Account Settings → Tokens. |
| Senha de banco (URL `postgres://…`) | Troque a senha do usuário do banco e atualize as connection strings. |
| Chave privada (PEM) | Gere par novo, troque onde a pública é confiada, revogue o certificado se houver. |

## 2. Trocar em todos os ambientes e fazer deploy

Vercel (Production **e** Preview), secrets das Edge Functions (`supabase secrets set`), GitHub Actions secrets/Environments, workers, cron, `.env.local` das máquinas de dev, apps mobile. Faça o deploy e confirme que o sistema funciona com a chave nova **antes** de desativar a antiga, quando o provedor permitir as duas ao mesmo tempo.

## 3. Provar que a chave antiga morreu

Leia a chave antiga de um arquivo temporário, nunca digitada no comando:

```bash
# Supabase: esperado 401
curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $(cat /tmp/chave-antiga)" -H "Authorization: Bearer $(cat /tmp/chave-antiga)"
# OpenAI: esperado 401
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models -H "Authorization: Bearer $(cat /tmp/chave-antiga)"
shred -u /tmp/chave-antiga 2>/dev/null || rm -P /tmp/chave-antiga 2>/dev/null || rm -f /tmp/chave-antiga
```

Critério: **resposta 401/403**. Se ainda responder 200, a contenção não terminou: volte ao passo 1.

## 4. Investigar o período exposto

```bash
git log --all --diff-filter=A --format='%h %ci %an' -- <arquivo>   # quando entrou
git log --all --diff-filter=D --format='%h %ci %an' -- <arquivo>   # quando saiu
```

- O repositório é ou já foi público? Teve fork? A chave apareceu em PR, issue, CI log ou bundle publicado?
- Logs do provedor no período (Supabase: API/Auth logs com a service role; LLM: uso por chave; Stripe: eventos).
- Dado pessoal pode ter sido acessado? Se sim, é incidente LGPD: avalie comunicação à ANPD e aos titulares (OPERATIONS do Padrão SaaS, §6).

## 5. Tirar do código atual

Variável de ambiente no servidor; `.env*` no `.gitignore` (fora `.env.example`); `git rm --cached <arquivo>`. Rode `node <plugin-root>/scripts/security/secret-scan.mjs --staged` antes do commit.

## 6. Histórico (só depois, e só se o usuário decidir)

Reescrever o histórico **não** desfaz o vazamento: forks, clones, caches e refs de PR guardam a chave. Faça só se o usuário quiser o histórico limpo (ex.: para o repo continuar público sem alarmes):

```bash
git filter-repo --invert-paths --path <arquivo>         # remove o arquivo de todos os commits
# ou: git filter-repo --replace-text expressions.txt    # troca só o valor
git push --force --all && git push --force --tags      # coordenado: todo mundo reclona
```

É force-push em todas as branches: precisa de autorização explícita e de aviso ao time. No GitHub, refs de PR fechados e views em cache só saem com o suporte.

## 7. Prevenção e registro

- `security.yml` no CI com `secret-scan.mjs --history` (checkout com `fetch-depth: 0`) e agenda semanal.
- Push protection do GitHub ligado; `.githooks/pre-commit` e `pre-push` do kit instalados (`git config core.hooksPath .githooks`).
- Registro do incidente: o que vazou (tipo, sem valor), desde quando, onde, contenção (horário), prova do passo 3, impacto, ação preventiva.

## Pronto quando

- [ ] Chave revogada no provedor e a antiga responde 401/403 (passo 3).
- [ ] Todos os ambientes com a chave nova; sistema funcionando.
- [ ] Período e impacto investigados; decisão LGPD registrada.
- [ ] Código atual limpo; `secret-scan.mjs --staged` e `--history` sem achado novo (ou o antigo registrado em `.secret-scan-allow.json` como "rotacionada em <data>").
- [ ] Decisão sobre o histórico registrada (reescrito ou mantido, com motivo).
