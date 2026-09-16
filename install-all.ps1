# install-all.ps1 — Instala todos os plugins do marketplace morallesfilms-local
# Uso (Windows PowerShell):
#   cd C:\Users\<seu-user>\Documents\claude-plugins
#   .\install-all.ps1

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
Write-Host ""
Write-Host "==> Instalando marketplace morallesfilms-local de:" -ForegroundColor Cyan
Write-Host "    $root" -ForegroundColor Gray
Write-Host ""

# 1. Adiciona marketplace (idempotente — Claude ignora se já existir)
& claude plugin marketplace add $root

# 2. Instala todos os plugins (mantenha em sincronia com .claude-plugin/marketplace.json)
$plugins = @("saas-shield-br", "code-health", "saas-builder-br", "turbo", "saas-audit-br")
foreach ($p in $plugins) {
    Write-Host ""
    Write-Host "==> Instalando $p..." -ForegroundColor Cyan
    & claude plugin install $p
}

Write-Host ""
Write-Host "==> Instalação concluída." -ForegroundColor Green
Write-Host ""
Write-Host "Plugins instalados:" -ForegroundColor Yellow
& claude plugin list

Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  1. Em qualquer projeto, abra Claude Code"
Write-Host "  2. Teste com: /novo-saas <conceito do seu projeto>"
Write-Host "     Ou audite um SaaS existente: /saas-audit-br:audit --audit-only"
Write-Host ""
