#!/usr/bin/env bash
# setup-claude.sh — Bootstrap completo do ambiente Claude Code (macOS/Linux)
#
# Pré-requisitos:
#   - Claude Code instalado (https://docs.claude.com/en/docs/claude-code)
#   - git instalado
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.sh | bash
#
# Ou clone primeiro e rode local:
#   git clone https://github.com/moralles-filmes/claude-plugins.git
#   cd claude-plugins
#   chmod +x setup-claude.sh && ./setup-claude.sh

set -euo pipefail

step() { printf "\033[36m→ %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m⚠ %s\033[0m\n" "$1"; }
err()  { printf "\033[31m✗ %s\033[0m\n" "$1" >&2; }

# ─── Pré-flight checks ─────────────────────────────────────────────────
step "Verificando dependências..."

if ! command -v claude >/dev/null 2>&1; then
  err "Claude Code não encontrado no PATH."
  echo "   Instale em: https://docs.claude.com/en/docs/claude-code"
  exit 1
fi
ok "claude CLI OK ($(claude --version 2>/dev/null || echo 'unknown'))"

if ! command -v git >/dev/null 2>&1; then
  err "git não encontrado no PATH."
  echo "   macOS: brew install git"
  echo "   Ubuntu/Debian: sudo apt install git"
  exit 1
fi
ok "git OK ($(git --version))"

# ─── Marketplaces oficiais ─────────────────────────────────────────────
step "Adicionando marketplaces oficiais Anthropic..."

OFFICIAL_MARKETPLACES=(
  'anthropics/claude-plugins-official'
  'anthropics/skills'
)
for m in "${OFFICIAL_MARKETPLACES[@]}"; do
  echo "  + $m"
  claude plugin marketplace add "$m" >/dev/null 2>&1 || true
done
ok "Marketplaces oficiais registrados"

# ─── Marketplace pessoal ───────────────────────────────────────────────
step "Configurando marketplace pessoal..."

PLUGIN_DIR="$HOME/Documents/claude-plugins"
REPO_URL="https://github.com/moralles-filmes/claude-plugins.git"

if [ -d "$PLUGIN_DIR" ]; then
  echo "  Pasta já existe — fazendo git pull..."
  (cd "$PLUGIN_DIR" && git pull --quiet)
else
  echo "  Clonando $REPO_URL..."
  git clone --quiet "$REPO_URL" "$PLUGIN_DIR"
fi

# Ativa hooks de validação local
if [ -d "$PLUGIN_DIR/.githooks" ]; then
  (cd "$PLUGIN_DIR" && git config core.hooksPath .githooks 2>/dev/null || true)
  chmod +x "$PLUGIN_DIR"/.githooks/* 2>/dev/null || true
  echo "  Hooks de validação ativados (.githooks/)"
fi

claude plugin marketplace add "$PLUGIN_DIR" >/dev/null 2>&1 || true
ok "Marketplace pessoal em $PLUGIN_DIR"

# ─── Instalação dos plugins ───────────────────────────────────────────
step "Instalando plugins..."

PLUGINS=(
  'saas-shield-br'
  'canvas-design'
  'frontend-design'
  'skill-creator'
  'mcp-builder'
)

for p in "${PLUGINS[@]}"; do
  echo "  → $p"
  if ! claude plugin install "$p" >/dev/null 2>&1; then
    warn "  Não foi possível instalar $p — talvez nome diferente no marketplace. Verifique manualmente."
  fi
done

# ─── Resumo ────────────────────────────────────────────────────────────
echo ""
ok "Setup concluído"
echo ""
echo "Plugins instalados:"
claude plugin list

echo ""
echo "Próximo passo:"
echo "  Abra um projeto seu e teste: /saas-shield-br:audit-tenant"
