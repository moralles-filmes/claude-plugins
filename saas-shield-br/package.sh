#!/usr/bin/env bash
# package.sh — Empacota o plugin saas-shield-br num .zip pronto para distribuir
# Uso (Linux/macOS, na pasta do plugin):
#   chmod +x package.sh && ./package.sh
#
# Saída: ../saas-shield-br-<versão>.zip (versão lida do .claude-plugin/plugin.json)
# Fica de fora: scripts de empacotamento e tests/ (os testes rodam no marketplace,
# porque usam os SQL de referência do padrao-saas).

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="saas-shield-br"
VERSION="$(node -p 'require(process.argv[1]).version' "$PLUGIN_ROOT/.claude-plugin/plugin.json")"
OUT_ZIP="$(dirname "$PLUGIN_ROOT")/${PLUGIN_NAME}-${VERSION}.zip"

if [ -f "$OUT_ZIP" ]; then
  rm -f "$OUT_ZIP"
  echo "→ Removido zip antigo."
fi

echo "→ Empacotando $PLUGIN_NAME v$VERSION..."
cd "$(dirname "$PLUGIN_ROOT")"

zip -r "$OUT_ZIP" "$(basename "$PLUGIN_ROOT")" \
  -x "*.DS_Store" \
  -x "*node_modules*" \
  -x "*.git/*" \
  -x "*/package.sh" \
  -x "*/package.ps1" \
  -x "*/tests/*" \
  > /dev/null

SIZE=$(du -h "$OUT_ZIP" | cut -f1)
echo ""
echo "✅ Pronto: $OUT_ZIP ($SIZE)"
echo ""
echo "Para instalar:"
echo "  1. claude plugin marketplace add $(dirname "$PLUGIN_ROOT")"
echo "  2. claude plugin install saas-shield-br"
