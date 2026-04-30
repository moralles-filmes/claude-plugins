#!/usr/bin/env bash
# scripts/install-hooks.sh — Configura git para usar .githooks/ deste repo
#
# Uso (na raiz do repo):
#   chmod +x scripts/install-hooks.sh
#   ./scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  echo "✗ Não estou num repo git." >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "→ Configurando core.hooksPath para .githooks/..."
git config core.hooksPath .githooks

# Garante executable bit em todos hooks (precisa em macOS/Linux)
chmod +x .githooks/* 2>/dev/null || true

echo "✓ Hooks ativos."
echo ""
echo "Próximo push vai rodar scripts/validate.mjs automaticamente."
echo "Para pular validação numa emergência: git push --no-verify"
