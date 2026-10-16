#!/usr/bin/env sh
set -eu
node --version
git --version
command -v claude >/dev/null 2>&1 && claude --version || echo "Claude Code not found"
command -v codex >/dev/null 2>&1 && { codex --version; codex login status || true; } || echo "Codex not found"
# Same rule as the router: printable ASCII, no spaces, 20+ chars.
if [ -n "${DEEPSEEK_API_KEY:-}" ] && ! printf '%s' "$DEEPSEEK_API_KEY" | LC_ALL=C grep -Eq '^[!-~]{20,512}$'; then echo "DEEPSEEK_API_KEY: malformed (spaces, invisible characters or placeholder)"; fi
[ -n "${DEEPSEEK_API_KEY:-}" ] && echo "DEEPSEEK_API_KEY: configured" || echo "DEEPSEEK_API_KEY: not configured (do not paste it into chat)"
node "$(dirname "$0")/doctor.mjs" --root "$(pwd)"
