$ErrorActionPreference = "Stop"
Write-Host "AI Router BR - preflight" -ForegroundColor Cyan
node --version
git --version
if (Get-Command claude -ErrorAction SilentlyContinue) { claude --version } else { Write-Warning "Claude Code not found" }
if (Get-Command codex -ErrorAction SilentlyContinue) { codex --version; codex login status } else { Write-Warning "Codex not found" }
# Same rule as the router: printable ASCII, no spaces, 20+ chars. A Ctrl+V saved as text (char 22) fails here.
if ($env:DEEPSEEK_API_KEY -and $env:DEEPSEEK_API_KEY -cnotmatch '^[\x21-\x7e]{20,512}$') { Write-Warning "DEEPSEEK_API_KEY: malformed ($($env:DEEPSEEK_API_KEY.Length) chars). Copy the key, run [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', (Get-Clipboard).Trim(), 'User') and reopen the editor." }
elseif ($env:DEEPSEEK_API_KEY) { Write-Host "DEEPSEEK_API_KEY: configured" } else { Write-Warning "DEEPSEEK_API_KEY: not configured (do not paste it into chat)" }
node "$PSScriptRoot\doctor.mjs" --root (Get-Location)
