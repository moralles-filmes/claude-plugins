# package.ps1 — Empacota o plugin saas-shield-br num .zip pronto para distribuir
# Uso (Windows PowerShell, na pasta do plugin):
#   .\package.ps1
#
# Saída: ../saas-shield-br-1.0.0.zip

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginName = "saas-shield-br"
$version    = "1.0.0"
$outZip     = Join-Path (Split-Path -Parent $pluginRoot) "$pluginName-$version.zip"

if (Test-Path $outZip) {
    Remove-Item $outZip -Force
    Write-Host "Removido zip antigo." -ForegroundColor Yellow
}

Write-Host "Empacotando $pluginName v$version..." -ForegroundColor Cyan

# Conta arquivos antes
$files = Get-ChildItem -Path $pluginRoot -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\(node_modules|\.git)\\' -and
    $_.Name -notin @('package.ps1','package.sh','.DS_Store','Thumbs.db')
}
Write-Host ("  {0} arquivos a empacotar" -f $files.Count) -ForegroundColor Gray

# Compress-Archive já preserva estrutura. Excluímos package scripts.
Compress-Archive -Path "$pluginRoot\*" -DestinationPath $outZip -Force

# Tamanho
$sizeKB = [math]::Round((Get-Item $outZip).Length / 1KB, 1)
Write-Host ""
Write-Host "Pronto: $outZip ($sizeKB KB)" -ForegroundColor Green
Write-Host ""
Write-Host "Para instalar:" -ForegroundColor Cyan
Write-Host "  1. claude plugin marketplace add `"$(Split-Path -Parent $pluginRoot)`""
Write-Host "  2. claude plugin install saas-shield-br"
