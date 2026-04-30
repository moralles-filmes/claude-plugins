# setup-claude.ps1 -- Bootstrap completo do ambiente Claude Code numa maquina nova (Windows)
#
# Pre-requisitos:
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

function Write-Step { param($Msg) Write-Host "-> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "[OK] $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "[!] $Msg" -ForegroundColor Yellow }

# --- Pre-flight checks ------------------------------------------------
Write-Step "Verificando dependencias..."

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Claude Code nao encontrado no PATH." -ForegroundColor Red
    Write-Host "   Instale em: https://docs.claude.com/en/docs/claude-code"
    exit 1
}
Write-Ok "claude CLI OK"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[X] git nao encontrado no PATH." -ForegroundColor Red
    Write-Host "   Instale via: winget install --id Git.Git"
    exit 1
}
Write-Ok "git OK"

# --- Marketplaces oficiais --------------------------------------------
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

# --- Marketplace pessoal ----------------------------------------------
Write-Step "Configurando marketplace pessoal..."

$pluginDir = "$env:USERPROFILE\Documents\claude-plugins"
$repoUrl = "https://github.com/moralles-filmes/claude-plugins.git"

if (Test-Path $pluginDir) {
    Write-Host "  Pasta ja existe -- fazendo git pull..."
    Push-Location $pluginDir
    git pull --quiet
    Pop-Location
} else {
    Write-Host "  Clonando $repoUrl..."
    git clone --quiet $repoUrl $pluginDir
}

# Ativa hooks de validacao local
Push-Location $pluginDir
if (Test-Path .githooks) {
    git config core.hooksPath .githooks 2>$null
    Write-Host "  Hooks de validacao ativados (.githooks/)"
}
Pop-Location

claude plugin marketplace add $pluginDir 2>&1 | Out-Null
Write-Ok "Marketplace pessoal em $pluginDir"

# --- Instalacao dos plugins -------------------------------------------
Write-Step "Instalando plugins..."

$plugins = @(
    'saas-shield-br',
    'canvas-design',
    'frontend-design',
    'skill-creator',
    'mcp-builder'
)

foreach ($p in $plugins) {
    Write-Host "  -> $p"
    try {
        claude plugin install $p 2>&1 | Out-Null
    } catch {
        Write-Warn "  Nao foi possivel instalar $p -- talvez nome diferente no marketplace. Verifique manualmente."
    }
}

# --- Resumo -----------------------------------------------------------
Write-Host ""
Write-Ok "Setup concluido"
Write-Host ""
Write-Host "Plugins instalados:" -ForegroundColor Cyan
claude plugin list

Write-Host ""
Write-Host "Proximo passo:" -ForegroundColor Cyan
Write-Host "  Abra um projeto seu e teste: /saas-shield-br:audit-tenant"
