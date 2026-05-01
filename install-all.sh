#!/usr/bin/env bash
# install-all.sh — Instala os 3 plugins do marketplace morallesfilms-local
# Uso (Linux/macOS):
#   cd ~/claude-plugins
#   chmod +x install-all.sh
#   ./install-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "==> Instalando marketplace morallesfilms-local de:"
echo "    $ROOT"
echo ""

# 1. Adiciona marketplace (idempotente — Claude ignora se já existir)
claude plugin marketplace add "$ROOT"

# 2. Instala os 3 plugins
for p in saas-shield-br code-health saas-builder-br; do
  echo ""
  echo "==> Instalando $p..."
  claude plugin install "$p"
done

echo ""
echo "==> Instalação concluída."
echo ""
echo "Plugins instalados:"
claude plugin list

echo ""
echo "Próximos passos:"
echo "  1. Em qualquer projeto, abra Claude Code"
echo "  2. Teste com: /novo-saas <conceito do seu projeto>"
echo ""
