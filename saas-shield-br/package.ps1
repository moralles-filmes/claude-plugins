# package.ps1 — Empacota o plugin saas-shield-br num .zip pronto para distribuir
# Uso (Windows PowerShell, na pasta do plugin):
#   .\package.ps1
#
# Saída: ..\saas-shield-br-<versão>.zip (versão lida do .claude-plugin\plugin.json)
# Fica de fora: scripts de empacotamento, tests\ (rodam no marketplace), node_modules, .git.
# O zip tem a pasta saas-shield-br\ na raiz, igual ao package.sh.

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginName = "saas-shield-br"
$version    = (Get-Content -Raw (Join-Path $pluginRoot ".claude-plugin\plugin.json") | ConvertFrom-Json).version
$outZip     = Join-Path (Split-Path -Parent $pluginRoot) "$pluginName-$version.zip"

if (Test-Path $outZip) {
    Remove-Item $outZip -Force
    Write-Host "Removido zip antigo." -ForegroundColor Yellow
}

Write-Host "Empacotando $pluginName v$version..." -ForegroundColor Cyan

$files = Get-ChildItem -Path $pluginRoot -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($pluginRoot.Length + 1)
    $rel -notmatch '(^|\\)(node_modules|\.git|tests)(\\|$)' -and
    $_.Name -notin @('package.ps1', 'package.sh', '.DS_Store', 'Thumbs.db')
}
Write-Host ("  {0} arquivos a empacotar" -f $files.Count) -ForegroundColor Gray

# Compress-Archive não tem exclusão: copia os arquivos filtrados para uma pasta temporária.
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("$pluginName-" + [guid]::NewGuid())
$target  = Join-Path $staging $pluginName
try {
    foreach ($f in $files) {
        $rel  = $f.FullName.Substring($pluginRoot.Length + 1)
        $dest = Join-Path $target $rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Copy-Item -LiteralPath $f.FullName -Destination $dest
    }
    Compress-Archive -Path $target -DestinationPath $outZip -Force
}
finally {
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
}

$sizeKB = [math]::Round((Get-Item $outZip).Length / 1KB, 1)
Write-Host ""
Write-Host "Pronto: $outZip ($sizeKB KB)" -ForegroundColor Green
Write-Host ""
Write-Host "Para instalar:" -ForegroundColor Cyan
Write-Host "  1. claude plugin marketplace add `"$(Split-Path -Parent $pluginRoot)`""
Write-Host "  2. claude plugin install saas-shield-br"
