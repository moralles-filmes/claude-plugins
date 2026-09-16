#!/usr/bin/env bash
# install-all.sh — Instala todos os plugins do marketplace morallesfilms-local
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

# 2. Instala todos os plugins (mantenha em sincronia com .claude-plugin/marketplace.json)
for p in saas-shield-br code-health saas-builder-br turbo saas-audit-br ai-router-br; do
  echo ""
  echo "==> Instalando $p..."
  claude plugin install "$p"
done

# 3. Versão nativa Codex do ai-router-br (somente se o Codex CLI estiver instalado)
if command -v codex >/dev/null 2>&1; then
  echo ""
  echo "==> Instalando ai-router-br no Codex..."
  codex plugin marketplace list 2>/dev/null | grep -Eq '^[[:space:]]*morallesfilms-local[[:space:]]' || codex plugin marketplace add "$ROOT"
  codex plugin add ai-router-br@morallesfilms-local
else
  echo ""
  echo "Codex CLI não encontrado: pulei a versão Codex do ai-router-br (use ./setup-claude.sh para o setup completo)."
fi

echo ""
echo "==> Instalação concluída."
echo ""
echo "Plugins instalados:"
claude plugin list

echo ""
echo "Próximos passos:"
echo "  1. Em qualquer projeto, abra Claude Code"
echo "  2. Teste com: /novo-saas <conceito do seu projeto>"
echo "     Ou audite um SaaS existente: /saas-audit-br:audit --audit-only"
echo ""
