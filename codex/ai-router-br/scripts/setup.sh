#!/usr/bin/env sh
set -eu
node --version
git --version
command -v claude >/dev/null 2>&1 && claude --version || echo "Claude Code not found"
command -v codex >/dev/null 2>&1 && { codex --version; codex login status || true; } || echo "Codex not found"
[ -n "${DEEPSEEK_API_KEY:-}" ] && echo "DEEPSEEK_API_KEY: configured" || echo "DEEPSEEK_API_KEY: not configured (do not paste it into chat)"
node "$(dirname "$0")/doctor.mjs" --root "$(pwd)"
