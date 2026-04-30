# setup-claude.ps1 — Bootstrap completo do ambiente Claude Code numa máquina nova (Windows)
#
# Pré-requisitos:
#   - Claude Code instalado (https://docs.claude.com/en/docs/claude-code)
#   - git instalado
#
# Uso:
#   iwr -useb https://raw.githubusercontent.com/moralles-filmes/claude-plugins/main/setup-claude.ps1 | iex
#
# Ou clone primeiro e rode local:
#   git clone https://github.com/moralles-filmes/claude-plugins.git
#   cd claude-plugins
#   .\setup-claude.ps1

$ErrorActionPreference = "Stop"

function Write-Step { param($Msg) Write-Host "→ $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "✓ $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "⚠ $Msg" -ForegroundColor Yellow }

# ─── Pré-flight checks ─────────────────────────────────────────────────
Write-Step "Verificando dependências..."

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Claude Code não encontrado no PATH." -ForegroundColor Red
    Write-Host "   Instale em: https://docs.claude.com/en/docs/claude-code"
    exit 1
}
Write-Ok "claude CLI OK ($(claude --version 2>$null))"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ git não encontrado no PATH." -ForegroundColor Red
    Write-Host "   Instale via: winget install --id Git.Git"
    exit 1
}
Write-Ok "git OK ($(git --version))"

# ─── Marketplaces oficiais ─────────────────────────────────────────────
Write-Step "Adicionando marketplaces oficiais Anthropic..."

$officialMarketplaces = @(
    'anthropics/claude-plugins-official',
    'anthropics/skills'
)
foreach ($m in $officialMarketplaces) {
    Write-Host "  + $m"
    claude plugin marketplace add $m 2>&1 | Out-Null
}
Write-Ok "Marketplaces oficiais registrados"

# ─── Marketplace pessoal ───────────────────────────────────────────────
Write-Step "Configurando marketplace pessoal..."

$pluginDir = "$env:USERPROFILE\Documents\claude-plugins"
$repoUrl = "https://github.com/moralles-filmes/claude-plugins.git"

if (Test-Path $pluginDir) {
    Write-Host "  Pasta já existe — fazendo git pull..."
    Push-Location $pluginDir
    git pull --quiet
    Pop-Location
} else {
    Write-Host "  Clonando $repoUrl..."
    git clone --quiet $repoUrl $pluginDir
}

claude plugin marketplace add $pluginDir 2>&1 | Out-Null
Write-Ok "Marketplace pessoal em $pluginDir"

# ─── Instalação dos plugins ───────────────────────────────────────────
Write-Step "Instalando plugins..."

$plugins = @(
    @{ name = 'saas-shield-br';   marketplace = 'morallesfilms-local' },
    @{ name = 'canvas-design';    marketplace = 'anthropics-skills' },
    @{ name = 'frontend-design';  marketplace = 'claude-plugins-official' },
    @{ name = 'skill-creator';    marketplace = 'anthropics-skills' },
    @{ name = 'mcp-builder';      marketplace = 'anthropics-skills' }
)

foreach ($p in $plugins) {
    Write-Host "  → $($p.name)"
    try {
        claude plugin install $($p.name) 2>&1 | Out-Null
    } catch {
        Write-Warn "  Não foi possível instalar $($p.name) — talvez nome diferente no marketplace. Verifique manualmente."
    }
}

# ─── Resumo ────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "Setup concluído"
Write-Host ""
Write-Host "Plugins instalados:" -ForegroundColor Cyan
claude plugin list

Write-Host ""
Write-Host "Próximo passo:" -ForegroundColor Cyan
Write-Host "  Abra um projeto seu e teste: /saas-shield-br:audit-tenant"
