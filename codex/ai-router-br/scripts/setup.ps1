$ErrorActionPreference = "Stop"
Write-Host "AI Router BR - preflight" -ForegroundColor Cyan
node --version
git --version
if (Get-Command claude -ErrorAction SilentlyContinue) { claude --version } else { Write-Warning "Claude Code not found" }
if (Get-Command codex -ErrorAction SilentlyContinue) { codex --version; codex login status } else { Write-Warning "Codex not found" }
if ($env:DEEPSEEK_API_KEY) { Write-Host "DEEPSEEK_API_KEY: configured" } else { Write-Warning "DEEPSEEK_API_KEY: not configured (do not paste it into chat)" }
node "$PSScriptRoot\doctor.mjs" --root (Get-Location)
