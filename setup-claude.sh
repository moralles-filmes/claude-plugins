#!/usr/bin/env bash
# setup-claude.sh — Bootstrap e atualização idempotente do ambiente (macOS/Linux)
#
# Reconstrói numa máquina nova (ou atualiza nesta) o ambiente Claude Code + Codex a partir de
# https://github.com/moralles-filmes/claude-plugins :
#   - verifica Git, Node.js 20+, Claude Code e Codex CLI (instala Claude Code/Codex pelos
#     instaladores oficiais quando faltarem)
#   - verifica login do Claude (assinatura) e do Codex via ChatGPT (nunca troca por API key)
#   - registra/atualiza marketplaces e instala/atualiza TODOS os plugins do marketplace
#     (inclui ai-router-br) + plugins oficiais de uso diário
#   - instala a versão nativa Codex do ai-router-br
#   - valida plugins, roda testes essenciais e o doctor
#   - verifica apenas a EXISTÊNCIA de DEEPSEEK_API_KEY (nunca o valor)
#
# Uso recomendado:
#   git clone https://github.com/moralles-filmes/claude-plugins.git
#   cd claude-plugins
#   ./setup-claude.sh
#
# Opções:
#   --check-only         só verifica e mostra o que faria; não instala nem altera nada
#   --no-install         não instala Claude Code/Codex CLI automaticamente (só orienta)
#   --no-pull            não atualiza o checkout com git pull --ff-only
#   --skip-codex         pula a parte Codex
#   --skip-extras        não instala os plugins oficiais extras
#   --skip-tests         pula validação e testes
#   --local-marketplace  registra o checkout local como marketplace (desenvolvimento)
#
# Pode ser executado de novo a qualquer momento: nunca usa comandos Git destrutivos, nunca
# altera ou exibe secrets e nunca substitui o login por API key.

set -uo pipefail

# Everything runs inside main: with `curl ... | bash`, bash reads the whole function before executing it, so a
# truncated download never runs partially and child commands cannot consume the rest of the script from stdin.
main() {

CHECK_ONLY=0; NO_INSTALL=0; NO_PULL=0; SKIP_CODEX=0; SKIP_EXTRAS=0; SKIP_TESTS=0; LOCAL_MARKETPLACE=0
for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=1 ;;
    --no-install) NO_INSTALL=1 ;;
    --no-pull) NO_PULL=1 ;;
    --skip-codex) SKIP_CODEX=1 ;;
    --skip-extras) SKIP_EXTRAS=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --local-marketplace) LOCAL_MARKETPLACE=1 ;;
    *) echo "Opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

REPO_URL="https://github.com/moralles-filmes/claude-plugins.git"
REPO_SLUG="moralles-filmes/claude-plugins"
MARKETPLACE_NAME="morallesfilms-local"
OFFICIAL_MARKETPLACES=("claude-plugins-official=anthropics/claude-plugins-official" "anthropic-agent-skills=anthropics/skills")
EXTRA_PLUGINS=("frontend-design@claude-plugins-official" "skill-creator@claude-plugins-official" "superpowers@claude-plugins-official")

WARNINGS=(); FAILURES=()
step()  { printf "\n\033[36m→ %s\033[0m\n" "$1"; }
ok()    { printf "   \033[32m✓ %s\033[0m\n" "$1"; }
info()  { printf "   %s\n" "$1"; }
warn()  { printf "   \033[33m⚠ %s\033[0m\n" "$1"; WARNINGS+=("$1"); }
fail()  { printf "   \033[31m✗ %s\033[0m\n" "$1"; FAILURES+=("$1"); }
would() { printf "   \033[90m[check-only] faria: %s\033[0m\n" "$1"; }
has()   { command -v "$1" >/dev/null 2>&1; }
refresh_path() { export PATH="$HOME/.local/bin:$PATH"; hash -r 2>/dev/null || true; }

echo "Setup do ambiente Claude Code + Codex (${MARKETPLACE_NAME})"
[ "$CHECK_ONLY" = 1 ] && echo "Modo --check-only: nada será instalado ou alterado."
refresh_path

# ─── Git ────────────────────────────────────────────────────────────────
step "Git"
if ! has git; then
  fail "git não encontrado. macOS: xcode-select --install (ou brew install git). Debian/Ubuntu: sudo apt install git."
  exit 1
fi
ok "$(git --version)"

# ─── Checkout do marketplace ────────────────────────────────────────────
step "Checkout do marketplace"
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/.claude-plugin/marketplace.json" ]; then
  REPO_ROOT="$SCRIPT_DIR"
else
  REPO_ROOT="$HOME/Documents/claude-plugins"
  if [ ! -d "$REPO_ROOT/.git" ]; then
    if [ -e "$REPO_ROOT" ]; then fail "$REPO_ROOT existe mas não é um clone git. Clone o repositório em outra pasta e rode o setup de dentro dela."; exit 1; fi
    if [ "$CHECK_ONLY" = 1 ]; then would "git clone $REPO_URL $REPO_ROOT"
    else mkdir -p "$(dirname "$REPO_ROOT")"; git clone --quiet "$REPO_URL" "$REPO_ROOT" || { fail "git clone falhou"; exit 1; }; fi
  fi
fi
ok "Checkout: $REPO_ROOT"
if [ -d "$REPO_ROOT/.git" ]; then
  if [ "$NO_PULL" = 1 ]; then info "Atualização do checkout ignorada (--no-pull)."
  else
    branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
    if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then warn "Checkout com mudanças locais: não atualizei (sem comandos destrutivos). Faça commit/stash e rode de novo para atualizar."
    elif [ "$branch" != "main" ]; then warn "Checkout na branch '$branch': não atualizei automaticamente."
    elif [ "$CHECK_ONLY" = 1 ]; then would "git pull --ff-only"
    else
      before="$(git -C "$REPO_ROOT" rev-parse HEAD)"
      if git -C "$REPO_ROOT" pull --ff-only --quiet; then
        [ "$(git -C "$REPO_ROOT" rev-parse HEAD)" != "$before" ] && ok "Checkout atualizado (fast-forward). Se o próprio setup mudou, rode-o novamente." || ok "Checkout já estava atualizado"
      else warn "git pull --ff-only falhou; seguindo com o checkout atual."; fi
    fi
  fi
  if [ "$CHECK_ONLY" = 0 ] && [ -d "$REPO_ROOT/.githooks" ]; then
    # The executable bit comes from git (mode 100755); a local chmod would show as a change and block future pulls.
    git -C "$REPO_ROOT" config core.hooksPath .githooks && ok "Hooks de validação do repositório ativos (.githooks/)"
  fi
fi

# ─── Node.js ────────────────────────────────────────────────────────────
step "Node.js 20+"
NODE_OK=0
if has node; then
  nv="$(node --version)"; major="${nv#v}"; major="${major%%.*}"
  if [ "${major:-0}" -ge 20 ] 2>/dev/null; then NODE_OK=1; ok "node $nv"
  else warn "node $nv é anterior ao 20. Atualize pelo LTS de https://nodejs.org/en/download."; fi
else
  warn "Node.js não encontrado. Instale o LTS de https://nodejs.org/en/download. Sem Node o ai-router-br, seus hooks e os testes não rodam."
fi
# Reads a dotted field from JSON on stdin; for arrays, prints the field of each element (one per line).
json_get() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const get=o=>process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],o);const v=Array.isArray(j)?j.map(get):get(j);console.log(Array.isArray(v)?v.join("\n"):(v==null?"":String(v)))}catch(e){process.exit(1)}})' "$1"; }

# Presence only: the value is never printed.
env_present() { [ -n "${!1:-}" ]; }

# ─── Claude Code ────────────────────────────────────────────────────────
step "Claude Code"
if ! has claude; then
  if [ "$NO_INSTALL" = 1 ]; then fail "Claude Code não encontrado. Instale (oficial): curl -fsSL https://claude.ai/install.sh | bash"
  elif [ "$CHECK_ONLY" = 1 ]; then would "curl -fsSL https://claude.ai/install.sh | bash"
  else info "Instalador oficial: curl -fsSL https://claude.ai/install.sh | bash"; curl -fsSL https://claude.ai/install.sh | bash; refresh_path; fi
fi
HAS_CLAUDE=0
if has claude; then
  HAS_CLAUDE=1; ok "$(claude --version)"
  auth_json="$(claude auth status 2>/dev/null || true)"
  if [ "$NODE_OK" = 1 ] && [ "$(printf '%s' "$auth_json" | json_get loggedIn 2>/dev/null)" = "true" ]; then
    method="$(printf '%s' "$auth_json" | json_get authMethod)"; provider="$(printf '%s' "$auth_json" | json_get apiProvider)"
    ok "Claude logado (método: $method; provider: $provider)"
    if [ "$provider" != "firstParty" ] || printf '%s' "$method" | grep -qi api; then warn "O Claude Code não está usando o login normal da assinatura. O ai-router-br não precisa de ANTHROPIC_API_KEY; revise se não for intencional."; fi
  elif printf '%s' "$auth_json" | grep -q '"loggedIn": *true'; then ok "Claude logado"
  else warn "Claude Code não está logado. Rode 'claude' e entre com sua assinatura (não use ANTHROPIC_API_KEY)."; fi
  for n in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL; do
    env_present "$n" && warn "$n está definida neste shell (valor não exibido) e pode desviar o Claude da sua assinatura. O setup não altera isso."
  done
elif [ "$CHECK_ONLY" = 0 ]; then
  fail "Claude Code continua fora do PATH. Abra um novo terminal e rode o setup de novo."
fi

# ─── Codex CLI ──────────────────────────────────────────────────────────
HAS_CODEX=0
step "Codex CLI"
if [ "$SKIP_CODEX" = 1 ]; then info "Ignorado (--skip-codex)."
else
  if ! has codex; then
    if [ "$NO_INSTALL" = 1 ]; then warn "Codex CLI não encontrado. Instale (oficial): curl -fsSL https://chatgpt.com/codex/install.sh | sh"
    elif [ "$CHECK_ONLY" = 1 ]; then would "curl -fsSL https://chatgpt.com/codex/install.sh | sh"
    else info "Instalador oficial: curl -fsSL https://chatgpt.com/codex/install.sh | sh"; curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh; refresh_path; fi
  fi
  if has codex; then
    HAS_CODEX=1; ok "$(codex --version)"
    login="$(codex login status 2>&1 || true)"
    if printf '%s' "$login" | grep -q ChatGPT; then ok "Codex autenticado via ChatGPT"
    elif printf '%s' "$login" | grep -q "API key"; then warn "Codex está autenticado por API key. O ai-router-br exige login ChatGPT: rode 'codex logout' e depois 'codex login' (entrar com ChatGPT). O setup não troca o login sozinho."
    elif [ "$CHECK_ONLY" = 0 ] && [ -t 0 ]; then
      read -r -p "   Codex não está logado. Rodar 'codex login' agora (abre o navegador para entrar com ChatGPT)? [s/N] " ans
      if [[ "$ans" =~ ^(s|sim|y|yes)$ ]]; then codex login; codex login status 2>&1 | grep -q ChatGPT && ok "Codex autenticado via ChatGPT" || warn "Login do Codex não confirmado. Rode 'codex login' e entre com ChatGPT."
      else warn "Codex não está logado. Rode 'codex login' e entre com ChatGPT (não configure OPENAI_API_KEY para o router)."; fi
    else warn "Codex não está logado. Rode 'codex login' e entre com ChatGPT (não configure OPENAI_API_KEY para o router)."; fi
    env_present OPENAI_API_KEY && info "OPENAI_API_KEY existe neste shell (valor não exibido); o ai-router-br remove essa variável do ambiente dos workers."
  elif [ "$CHECK_ONLY" = 0 ]; then warn "Codex CLI fora do PATH; parte Codex ignorada. Abra um novo terminal e rode o setup de novo."; fi
fi

MARKETPLACE_FILE="$REPO_ROOT/.claude-plugin/marketplace.json"

# ─── Marketplaces e plugins Claude ──────────────────────────────────────
if [ "$HAS_CLAUDE" = 1 ]; then
  step "Marketplaces Claude"
  known="$(claude plugin marketplace list --json 2>/dev/null | { [ "$NODE_OK" = 1 ] && json_get name || grep -o '"name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/'; } 2>/dev/null || true)"
  [ "$LOCAL_MARKETPLACE" = 1 ] && my_source="$REPO_ROOT" || my_source="$REPO_SLUG"
  markets=()
  [ "$SKIP_EXTRAS" = 0 ] && markets+=("${OFFICIAL_MARKETPLACES[@]}")
  markets+=("$MARKETPLACE_NAME=$my_source")
  for entry in "${markets[@]}"; do
    name="${entry%%=*}"; source="${entry#*=}"
    if printf '%s\n' "$known" | grep -qx "$name"; then
      if [ "$CHECK_ONLY" = 1 ]; then would "claude plugin marketplace update $name"; continue; fi
      claude plugin marketplace update "$name" >/dev/null 2>&1 && ok "$name atualizado" || warn "Falha ao atualizar $name"
    else
      if [ "$CHECK_ONLY" = 1 ]; then would "claude plugin marketplace add $source"; continue; fi
      claude plugin marketplace add "$source" >/dev/null 2>&1 && ok "$name registrado ($source)" || fail "Falha ao registrar $name ($source)"
    fi
  done

  step "Plugins Claude"
  wanted=()
  if [ -f "$MARKETPLACE_FILE" ]; then
    if [ "$NODE_OK" = 1 ]; then
      while IFS= read -r p; do [ -n "$p" ] && wanted+=("$p@$MARKETPLACE_NAME"); done < <(node -e 'console.log(require(process.argv[1]).plugins.map(p=>p.name).join("\n"))' "$MARKETPLACE_FILE")
    else
      while IFS= read -r p; do wanted+=("$p@$MARKETPLACE_NAME"); done < <(grep -o '"source": *"\./[^"]*"' "$MARKETPLACE_FILE" | sed 's#.*"\./\([^"]*\)"$#\1#')
    fi
  else would "ler plugins de $MARKETPLACE_FILE depois do clone"; fi
  [ "$SKIP_EXTRAS" = 0 ] && wanted+=("${EXTRA_PLUGINS[@]}")
  installed="$(claude plugin list --json 2>/dev/null | { [ "$NODE_OK" = 1 ] && json_get id || grep -o '"id": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/'; } 2>/dev/null || true)"
  for p in ${wanted[@]+"${wanted[@]}"}; do
    printf '%s\n' "$installed" | grep -qx "$p" && verb=update || verb=install
    if [ "$CHECK_ONLY" = 1 ]; then would "claude plugin $verb $p"; continue; fi
    claude plugin "$verb" "$p" >/dev/null 2>&1 && ok "$p ($verb)" || fail "claude plugin $verb $p falhou"
  done
fi

# ─── ai-router-br nativo no Codex ───────────────────────────────────────
if [ "$HAS_CODEX" = 1 ]; then
  step "Plugin Codex: ai-router-br"
  [ "$LOCAL_MARKETPLACE" = 1 ] && codex_source="$REPO_ROOT" || codex_source="$REPO_SLUG"
  if codex plugin marketplace list 2>/dev/null | grep -Eq "^[[:space:]]*${MARKETPLACE_NAME}[[:space:]]"; then
    if [ "$CHECK_ONLY" = 1 ]; then would "codex plugin marketplace upgrade $MARKETPLACE_NAME"
    else codex plugin marketplace upgrade "$MARKETPLACE_NAME" >/dev/null 2>&1 && ok "Marketplace Codex $MARKETPLACE_NAME atualizado" || info "Marketplace Codex $MARKETPLACE_NAME já configurado; 'codex plugin marketplace upgrade' não atualizou (normal para fonte local; para fonte GitHub, rode o comando manualmente para ver o erro)."; fi
  else
    ref_args=(--ref main); [ "$LOCAL_MARKETPLACE" = 1 ] && ref_args=()
    if [ "$CHECK_ONLY" = 1 ]; then would "codex plugin marketplace add $codex_source ${ref_args[*]+${ref_args[*]}}"
    else codex plugin marketplace add "$codex_source" ${ref_args[@]+"${ref_args[@]}"} >/dev/null 2>&1 && ok "Marketplace Codex $MARKETPLACE_NAME registrado ($codex_source)" || fail "Falha ao registrar marketplace Codex ($codex_source)"; fi
  fi
  if [ "$CHECK_ONLY" = 1 ]; then would "codex plugin add ai-router-br@$MARKETPLACE_NAME"
  else codex plugin add "ai-router-br@$MARKETPLACE_NAME" >/dev/null 2>&1 && ok "ai-router-br@$MARKETPLACE_NAME instalado/atualizado no Codex" || fail "codex plugin add ai-router-br@$MARKETPLACE_NAME falhou"; fi
  if [ "$NODE_OK" = 1 ]; then
    if [ "$CHECK_ONLY" = 1 ]; then would "sincronizar o bloco curto do ai-router-br no AGENTS.md global do Codex"
    elif [ -f "$REPO_ROOT/codex/ai-router-br/scripts/sync-rules.mjs" ]; then
      node "$REPO_ROOT/codex/ai-router-br/scripts/sync-rules.mjs" --codex-home --apply >/dev/null && ok "Bloco curto do ai-router-br presente no AGENTS.md global do Codex (conteúdo existente preservado)" || warn "Não consegui sincronizar o AGENTS.md global do Codex"
    fi
  fi
fi

# ─── Validação e testes ─────────────────────────────────────────────────
step "Validação e testes essenciais"
if [ "$SKIP_TESTS" = 1 ]; then info "Ignorado (--skip-tests)."
elif [ "$NODE_OK" = 0 ]; then warn "Ignorado: Node.js 20+ indisponível."
elif [ ! -f "$MARKETPLACE_FILE" ]; then would "validar e testar depois do clone"
else
  node "$REPO_ROOT/scripts/validate.mjs" >/dev/null 2>&1 && ok "scripts/validate.mjs (marketplace Claude + Codex, sincronia do ai-router-br)" || fail "scripts/validate.mjs falhou (rode: node scripts/validate.mjs)"
  if [ "$HAS_CLAUDE" = 1 ]; then claude plugin validate "$REPO_ROOT/ai-router-br" >/dev/null 2>&1 && ok "claude plugin validate ai-router-br" || fail "claude plugin validate ai-router-br falhou"; fi
  for dir in ai-router-br codex/ai-router-br; do
    out="$(node "$REPO_ROOT/$dir/scripts/run-tests.mjs" 2>&1)"; code=$?
    summary="$(printf '%s\n' "$out" | grep -Eo '(tests|pass|fail) [0-9]+$' | paste -sd, - 2>/dev/null)"
    [ $code = 0 ] && ok "testes $dir ($summary)" || fail "testes de $dir falharam ($summary). Detalhes: node $dir/scripts/run-tests.mjs"
    node "$REPO_ROOT/$dir/scripts/security-audit.mjs" >/dev/null 2>&1 && ok "security audit $dir" || fail "security audit $dir falhou"
  done
fi

# ─── Doctor ─────────────────────────────────────────────────────────────
if [ "$NODE_OK" = 1 ] && [ -f "$REPO_ROOT/ai-router-br/scripts/doctor.mjs" ]; then
  step "Doctor do ai-router-br (sem valores de secrets)"
  node "$REPO_ROOT/ai-router-br/scripts/doctor.mjs" --root "$REPO_ROOT" | sed 's/^/   /'
fi

# ─── DeepSeek ───────────────────────────────────────────────────────────
step "DeepSeek (opcional: worker econômico pago por API)"
if env_present DEEPSEEK_API_KEY; then ok "DEEPSEEK_API_KEY configurada (valor não exibido)"
else warn "DEEPSEEK_API_KEY não configurada. Configure localmente (ex.: no seu ~/.zshrc/~/.bashrc ou gerenciador de secrets) e abra um novo terminal. Nunca cole a chave em chats, no Git, CLAUDE.md, AGENTS.md ou .ai-router/. Sem ela o router funciona com Claude + Codex."; fi

# ─── Resumo ─────────────────────────────────────────────────────────────
echo ""
echo "==================== Resumo ===================="
if [ ${#FAILURES[@]} -eq 0 ]; then ok "Setup concluído$([ "$CHECK_ONLY" = 1 ] && echo ' (check-only)')."
else printf "\033[31mSetup terminou com %d falha(s):\033[0m\n" "${#FAILURES[@]}"; for f in "${FAILURES[@]}"; do echo "  - $f"; done; fi
if [ ${#WARNINGS[@]} -gt 0 ]; then echo "Avisos (${#WARNINGS[@]}):"; for w in "${WARNINGS[@]}"; do echo "  - $w"; done; fi
echo ""
echo "Próximo passo: abra qualquer projeto no Claude Code ou no Codex e faça seu pedido normalmente."
echo "O ai-router-br se auto-inicializa no primeiro uso de cada projeto. Reinicie sessões abertas para carregar plugins atualizados."
[ ${#FAILURES[@]} -eq 0 ]
}

main "$@"
