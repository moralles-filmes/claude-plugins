# scripts/install-hooks.ps1 -- Configura git para usar .githooks/ deste repo
#
# Uso (na raiz do repo):
#   .\scripts\install-hooks.ps1

$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    Write-Host "[X] Nao estou num repo git." -ForegroundColor Red
    exit 1
}

Push-Location $repoRoot

Write-Host "-> Configurando core.hooksPath para .githooks/..." -ForegroundColor Cyan
git config core.hooksPath .githooks

Write-Host "[OK] Hooks ativos." -ForegroundColor Green
Write-Host ""
Write-Host "Proximo push vai rodar scripts/validate.mjs automaticamente."
Write-Host "Para pular validacao numa emergencia: git push --no-verify"

Pop-Location
