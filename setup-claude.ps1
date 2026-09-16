# setup-claude.ps1 -- Bootstrap e atualizacao idempotente do ambiente (Windows)
#
# Reconstroi numa maquina nova (ou atualiza nesta) o ambiente Claude Code + Codex a partir de
# https://github.com/moralles-filmes/claude-plugins :
#   - verifica Git, Node.js 20+, Claude Code e Codex CLI (instala Claude Code/Codex pelos
#     instaladores oficiais quando faltarem)
#   - verifica login do Claude (assinatura) e do Codex via ChatGPT (nunca troca por API key)
#   - registra/atualiza marketplaces e instala/atualiza TODOS os plugins do marketplace
#     (inclui ai-router-br) + plugins oficiais de uso diario
#   - instala a versao nativa Codex do ai-router-br
#   - valida plugins, roda testes essenciais e o doctor
#   - verifica apenas a EXISTENCIA de DEEPSEEK_API_KEY (nunca o valor)
#
# Uso recomendado:
#   git clone https://github.com/moralles-filmes/claude-plugins.git
#   cd claude-plugins
#   .\setup-claude.ps1
#
# Se a politica de execucao bloquear scripts:
#   powershell -ExecutionPolicy Bypass -File .\setup-claude.ps1
#
# Opcoes:
#   -CheckOnly         so verifica e mostra o que faria; nao instala nem altera nada
#   -NoInstall         nao instala Claude Code/Codex CLI automaticamente (so orienta)
#   -NoPull            nao atualiza o checkout com git pull --ff-only
#   -SkipCodex         pula a parte Codex
#   -SkipExtras        nao instala os plugins oficiais extras
#   -SkipTests         pula validacao e testes
#   -LocalMarketplace  registra o checkout local como marketplace (desenvolvimento)
#
# Pode ser executado de novo a qualquer momento: nunca usa comandos Git destrutivos, nunca
# altera ou exibe secrets e nunca substitui o login por API key.

$Opt = @{}
foreach ($a in $args) { $Opt[(([string]$a) -replace '^-+', '').ToLowerInvariant()] = $true }
$CheckOnly        = [bool]$Opt['checkonly']
$NoInstall        = [bool]$Opt['noinstall']
$NoPull           = [bool]$Opt['nopull']
$SkipCodex        = [bool]$Opt['skipcodex']
$SkipExtras       = [bool]$Opt['skipextras']
$SkipTests        = [bool]$Opt['skiptests']
$LocalMarketplace = [bool]$Opt['localmarketplace']

$RepoUrl         = "https://github.com/moralles-filmes/claude-plugins.git"
$RepoSlug        = "moralles-filmes/claude-plugins"
$MarketplaceName = "morallesfilms-local"
$OfficialMarketplaces = @(
    @{ Name = "claude-plugins-official"; Source = "anthropics/claude-plugins-official" },
    @{ Name = "anthropic-agent-skills";  Source = "anthropics/skills" }
)
$ExtraPlugins = @(
    "frontend-design@claude-plugins-official",
    "skill-creator@claude-plugins-official",
    "superpowers@claude-plugins-official"
)
$ClaudeInstall = 'irm https://claude.ai/install.ps1 | iex'
$CodexInstall  = '$env:CODEX_NON_INTERACTIVE=''1''; irm https://chatgpt.com/codex/install.ps1 | iex'

$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:Failures = New-Object System.Collections.Generic.List[string]

function Write-Step  { param($Msg) Write-Host ""; Write-Host "-> $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "   [OK] $Msg" -ForegroundColor Green }
function Write-Info  { param($Msg) Write-Host "   $Msg" }
function Write-Warn  { param($Msg) Write-Host "   [!] $Msg" -ForegroundColor Yellow; $script:Warnings.Add([string]$Msg) }
function Write-Fail  { param($Msg) Write-Host "   [X] $Msg" -ForegroundColor Red; $script:Failures.Add([string]$Msg) }
function Write-Would { param($Msg) Write-Host "   [check-only] faria: $Msg" -ForegroundColor DarkGray }

function Test-Command { param($Name) return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Presence only: the value is never printed or stored.
function Test-EnvPresent {
    param($Name)
    foreach ($scope in 'Process', 'User', 'Machine') {
        if ([Environment]::GetEnvironmentVariable($Name, $scope)) { return $true }
    }
    return $false
}

function Update-SessionPath {
    # Keep the current order (Machine before User, as Windows builds it) and only append what is missing.
    $parts = @($env:Path -split ';') + @(
        [Environment]::GetEnvironmentVariable("Path", "Machine"),
        [Environment]::GetEnvironmentVariable("Path", "User"),
        "$env:USERPROFILE\.local\bin",
        "$env:LOCALAPPDATA\Programs\OpenAI\Codex\bin"
    )
    $env:Path = (($parts -split ';') | Where-Object { $_ } | Select-Object -Unique) -join ';'
}

# Runs a native command and captures output without turning stderr into terminating errors.
function Invoke-Native {
    param([string]$Exe, [string[]]$ArgList)
    $out = & $Exe @ArgList 2>&1 | ForEach-Object { "$_" }
    return [PSCustomObject]@{ Code = $LASTEXITCODE; Output = (@($out) -join "`n") }
}

function Invoke-OfficialInstaller {
    param([string]$Name, [string]$Command)
    Write-Info "Instalador oficial de ${Name}: $Command"
    if ($CheckOnly) { Write-Would "instalar $Name"; return }
    # Child process: the installer's StrictMode/ErrorAction settings must not leak into this script.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $Command | Out-Host
    Update-SessionPath
}

function Invoke-Setup {
    # Function scope: under "iwr | iex" this must not change the caller's session preference.
    $ErrorActionPreference = "Continue"
    Write-Host "Setup do ambiente Claude Code + Codex (morallesfilms-local)" -ForegroundColor Cyan
    if ($CheckOnly) { Write-Host "Modo -CheckOnly: nada sera instalado ou alterado." -ForegroundColor DarkGray }
    Update-SessionPath

    # --- Git -------------------------------------------------------------
    Write-Step "Git"
    if (-not (Test-Command git)) {
        Write-Fail "git nao encontrado. Instale com: winget install --id Git.Git -e  (ou https://git-scm.com/downloads/win) e rode o setup de novo."
        return 1
    }
    Write-Ok ((git --version) -join ' ')

    # --- Checkout do marketplace ----------------------------------------
    Write-Step "Checkout do marketplace"
    if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot ".claude-plugin\marketplace.json"))) {
        $RepoRoot = $PSScriptRoot
    } else {
        $RepoRoot = Join-Path $env:USERPROFILE "Documents\claude-plugins"
        if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
            if (Test-Path $RepoRoot) {
                Write-Fail "$RepoRoot existe mas nao e um clone git. Clone o repositorio em outra pasta e rode o setup de dentro dela."
                return 1
            }
            if ($CheckOnly) { Write-Would "git clone $RepoUrl $RepoRoot" }
            else {
                $c = Invoke-Native git @("clone", "--quiet", $RepoUrl, $RepoRoot)
                if ($c.Code -ne 0) { Write-Fail "git clone falhou: $($c.Output)"; return 1 }
            }
        }
    }
    $script:RepoRoot = $RepoRoot
    Write-Ok "Checkout: $RepoRoot"
    if (Test-Path (Join-Path $RepoRoot ".git")) {
        if ($NoPull) { Write-Info "Atualizacao do checkout ignorada (-NoPull)." }
        else {
            $dirty  = Invoke-Native git @("-C", $RepoRoot, "status", "--porcelain")
            $branch = (Invoke-Native git @("-C", $RepoRoot, "rev-parse", "--abbrev-ref", "HEAD")).Output.Trim()
            if ($dirty.Output.Trim()) { Write-Warn "Checkout com mudancas locais: nao atualizei (sem comandos destrutivos). Faca commit/stash e rode de novo para atualizar." }
            elseif ($branch -ne "main") { Write-Warn "Checkout na branch '$branch': nao atualizei automaticamente." }
            elseif ($CheckOnly) { Write-Would "git pull --ff-only" }
            else {
                $before = (Invoke-Native git @("-C", $RepoRoot, "rev-parse", "HEAD")).Output.Trim()
                $p = Invoke-Native git @("-C", $RepoRoot, "pull", "--ff-only", "--quiet")
                if ($p.Code -ne 0) { Write-Warn "git pull --ff-only falhou; seguindo com o checkout atual. $($p.Output)" }
                elseif ((Invoke-Native git @("-C", $RepoRoot, "rev-parse", "HEAD")).Output.Trim() -ne $before) { Write-Ok "Checkout atualizado (fast-forward). Se o proprio setup mudou, rode-o novamente." }
                else { Write-Ok "Checkout ja estava atualizado" }
            }
        }
        if (-not $CheckOnly -and (Test-Path (Join-Path $RepoRoot ".githooks"))) {
            Invoke-Native git @("-C", $RepoRoot, "config", "core.hooksPath", ".githooks") | Out-Null
            Write-Ok "Hooks de validacao do repositorio ativos (.githooks/)"
        }
    }

    # --- Node.js ---------------------------------------------------------
    Write-Step "Node.js 20+"
    $NodeOk = $false
    if (Test-Command node) {
        $nv = ((node --version) -join '').Trim()
        if ($nv -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20) { $NodeOk = $true; Write-Ok "node $nv" }
        else { Write-Warn "node $nv e anterior ao 20. Atualize pelo instalador LTS de https://nodejs.org/en/download (ou: winget install OpenJS.NodeJS.LTS)." }
    } else {
        Write-Warn "Node.js nao encontrado. Instale o LTS de https://nodejs.org/en/download (ou: winget install OpenJS.NodeJS.LTS). Sem Node o ai-router-br, seus hooks e os testes nao rodam."
    }

    # --- Claude Code -----------------------------------------------------
    Write-Step "Claude Code"
    if (-not (Test-Command claude)) {
        if ($NoInstall) { Write-Fail "Claude Code nao encontrado. Instale (oficial): $ClaudeInstall" }
        else { Invoke-OfficialInstaller "Claude Code" $ClaudeInstall }
    }
    $HasClaude = Test-Command claude
    if ($HasClaude) {
        Write-Ok ((claude --version) -join ' ')
        $auth = $null
        try { $auth = (Invoke-Native claude @("auth", "status")).Output | ConvertFrom-Json } catch { }
        if ($auth -and $auth.loggedIn) {
            Write-Ok "Claude logado (metodo: $($auth.authMethod); provider: $($auth.apiProvider); plano: $($auth.subscriptionType))"
            if ($auth.apiProvider -ne 'firstParty' -or ([string]$auth.authMethod) -match 'api') {
                Write-Warn "O Claude Code nao esta usando o login normal da assinatura. O ai-router-br nao precisa de ANTHROPIC_API_KEY; revise isso se nao for intencional."
            }
        } else {
            Write-Warn "Claude Code nao esta logado. Rode 'claude' e entre com sua assinatura (nao use ANTHROPIC_API_KEY)."
        }
        foreach ($n in 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL') {
            if (Test-EnvPresent $n) { Write-Warn "$n esta definida neste sistema (valor nao exibido) e pode desviar o Claude da sua assinatura. O setup nao altera isso." }
        }
    } elseif (-not $CheckOnly) {
        Write-Fail "Claude Code continua fora do PATH. Abra um novo PowerShell e rode o setup de novo."
    }

    # --- Codex CLI -------------------------------------------------------
    $HasCodex = $false
    if ($SkipCodex) { Write-Step "Codex CLI"; Write-Info "Ignorado (-SkipCodex)." }
    else {
        Write-Step "Codex CLI"
        if (-not (Test-Command codex)) {
            if ($NoInstall) { Write-Warn "Codex CLI nao encontrado. Instale (oficial): powershell -ExecutionPolicy ByPass -c `"irm https://chatgpt.com/codex/install.ps1 | iex`"" }
            else { Invoke-OfficialInstaller "Codex CLI" $CodexInstall }
        }
        $HasCodex = Test-Command codex
        if ($HasCodex) {
            Write-Ok ((codex --version) -join ' ')
            $login = Invoke-Native codex @("login", "status")
            if ($login.Output -match 'ChatGPT') { Write-Ok "Codex autenticado via ChatGPT" }
            elseif ($login.Output -match 'API key') {
                Write-Warn "Codex esta autenticado por API key. O ai-router-br exige login ChatGPT: rode 'codex logout' e depois 'codex login' (entrar com ChatGPT). O setup nao troca o login sozinho."
            } else {
                $interactive = -not $CheckOnly -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
                if ($interactive -and ((Read-Host "   Codex nao esta logado. Rodar 'codex login' agora (abre o navegador para entrar com ChatGPT)? [s/N]") -match '^(s|sim|y|yes)$')) {
                    $codexCmd = Get-Command codex
                    # Only a real executable goes through Start-Process; an npm codex.ps1/.cmd shim would open in an editor.
                    if ($codexCmd.CommandType -eq 'Application' -and $codexCmd.Source -match '\.exe$') { Start-Process -FilePath $codexCmd.Source -ArgumentList "login" -NoNewWindow -Wait }
                    else { & codex login | Out-Host }
                    if ((Invoke-Native codex @("login", "status")).Output -match 'ChatGPT') { Write-Ok "Codex autenticado via ChatGPT" }
                    else { Write-Warn "Login do Codex nao confirmado. Rode 'codex login' e entre com ChatGPT." }
                } else {
                    Write-Warn "Codex nao esta logado. Rode 'codex login' e entre com ChatGPT (nao configure OPENAI_API_KEY para o router)."
                }
            }
            if (Test-EnvPresent 'OPENAI_API_KEY') { Write-Info "OPENAI_API_KEY existe neste sistema (valor nao exibido); o ai-router-br remove essa variavel do ambiente dos workers." }
        } elseif (-not $CheckOnly) {
            Write-Warn "Codex CLI fora do PATH; parte Codex ignorada. Abra um novo PowerShell e rode o setup de novo."
        }
    }

    $MarketplaceFile = Join-Path $RepoRoot ".claude-plugin\marketplace.json"

    # --- Marketplaces e plugins Claude ------------------------------------
    if ($HasClaude) {
        Write-Step "Marketplaces Claude"
        $known = @()
        $ml = Invoke-Native claude @("plugin", "marketplace", "list", "--json")
        try { $known = @(($ml.Output | ConvertFrom-Json) | ForEach-Object { $_.name }) } catch { Write-Warn "Nao consegui ler os marketplaces configurados." }
        $mySource = if ($LocalMarketplace) { $RepoRoot } else { $RepoSlug }
        $markets = @()
        if (-not $SkipExtras) { $markets += $OfficialMarketplaces }
        $markets += @{ Name = $MarketplaceName; Source = $mySource }
        foreach ($m in $markets) {
            if ($known -contains $m.Name) {
                if ($CheckOnly) { Write-Would "claude plugin marketplace update $($m.Name)"; continue }
                $u = Invoke-Native claude @("plugin", "marketplace", "update", $m.Name)
                if ($u.Code -eq 0) { Write-Ok "$($m.Name) atualizado" } else { Write-Warn "Falha ao atualizar $($m.Name): $($u.Output)" }
            } else {
                if ($CheckOnly) { Write-Would "claude plugin marketplace add $($m.Source)"; continue }
                $a = Invoke-Native claude @("plugin", "marketplace", "add", $m.Source)
                if ($a.Code -eq 0) { Write-Ok "$($m.Name) registrado ($($m.Source))" } else { Write-Fail "Falha ao registrar $($m.Name): $($a.Output)" }
            }
        }

        Write-Step "Plugins Claude"
        $wanted = @()
        if (Test-Path $MarketplaceFile) {
            $mp = Get-Content -Raw -Encoding UTF8 $MarketplaceFile | ConvertFrom-Json
            $wanted += @($mp.plugins | ForEach-Object { "$($_.name)@$MarketplaceName" })
        } else { Write-Would "ler plugins de $MarketplaceFile depois do clone" }
        if (-not $SkipExtras) { $wanted += $ExtraPlugins }
        $installed = @()
        try { $installed = @(((Invoke-Native claude @("plugin", "list", "--json")).Output | ConvertFrom-Json) | ForEach-Object { $_.id }) } catch { }
        foreach ($p in $wanted) {
            $verb = if ($installed -contains $p) { "update" } else { "install" }
            if ($CheckOnly) { Write-Would "claude plugin $verb $p"; continue }
            $x = Invoke-Native claude @("plugin", $verb, $p)
            if ($x.Code -eq 0) { Write-Ok "$p ($verb)" } else { Write-Fail "claude plugin $verb $p falhou: $($x.Output)" }
        }
    }

    # --- ai-router-br nativo no Codex --------------------------------------
    if ($HasCodex) {
        Write-Step "Plugin Codex: ai-router-br"
        $cml = Invoke-Native codex @("plugin", "marketplace", "list")
        $hasMarket = $cml.Output -match ("(?m)^\s*" + [regex]::Escape($MarketplaceName) + "\s")
        $codexSource = if ($LocalMarketplace) { $RepoRoot } else { $RepoSlug }
        if ($CheckOnly) {
            if ($hasMarket) { Write-Would "codex plugin marketplace upgrade $MarketplaceName" } else { Write-Would ("codex plugin marketplace add $codexSource" + $(if ($LocalMarketplace) { "" } else { " --ref main" })) }
            Write-Would "codex plugin add ai-router-br@$MarketplaceName"
        } else {
            if ($hasMarket) {
                $u = Invoke-Native codex @("plugin", "marketplace", "upgrade", $MarketplaceName)
                if ($u.Code -eq 0) { Write-Ok "Marketplace Codex $MarketplaceName atualizado" } else { Write-Info "Marketplace Codex $MarketplaceName ja configurado; 'codex plugin marketplace upgrade' nao atualizou (normal para fonte local; para fonte GitHub, rode o comando manualmente para ver o erro)." }
            } else {
                $addArgs = @("plugin", "marketplace", "add", $codexSource)
                if (-not $LocalMarketplace) { $addArgs += @("--ref", "main") }
                $a = Invoke-Native codex $addArgs
                if ($a.Code -eq 0) { Write-Ok "Marketplace Codex $MarketplaceName registrado ($codexSource)" } else { Write-Fail "Falha ao registrar marketplace Codex: $($a.Output)" }
            }
            $i = Invoke-Native codex @("plugin", "add", "ai-router-br@$MarketplaceName")
            if ($i.Code -eq 0) { Write-Ok "ai-router-br@$MarketplaceName instalado/atualizado no Codex" } else { Write-Fail "codex plugin add ai-router-br@$MarketplaceName falhou: $($i.Output)" }
        }
        if ($NodeOk) {
            $sync = Join-Path $RepoRoot "codex\ai-router-br\scripts\sync-rules.mjs"
            if ($CheckOnly) { Write-Would "sincronizar o bloco curto do ai-router-br no AGENTS.md global do Codex" }
            elseif (Test-Path $sync) {
                $s = Invoke-Native node @($sync, "--codex-home", "--apply")
                if ($s.Code -eq 0) { Write-Ok "Bloco curto do ai-router-br presente no AGENTS.md global do Codex (conteudo existente preservado)" } else { Write-Warn "Nao consegui sincronizar o AGENTS.md global do Codex: $($s.Output)" }
            }
        }
    }

    # --- Validacao e testes -------------------------------------------------
    if ($SkipTests) { Write-Step "Validacao e testes"; Write-Info "Ignorado (-SkipTests)." }
    elseif (-not $NodeOk) { Write-Step "Validacao e testes"; Write-Warn "Ignorado: Node.js 20+ indisponivel." }
    elseif (-not (Test-Path $MarketplaceFile)) { Write-Step "Validacao e testes"; Write-Would "validar e testar depois do clone" }
    else {
        Write-Step "Validacao e testes essenciais"
        $v = Invoke-Native node @((Join-Path $RepoRoot "scripts\validate.mjs"))
        if ($v.Code -eq 0) { Write-Ok "scripts/validate.mjs (marketplace Claude + Codex, sincronia do ai-router-br)" } else { Write-Fail "scripts/validate.mjs falhou:`n$($v.Output)" }
        if ($HasClaude) {
            $cv = Invoke-Native claude @("plugin", "validate", (Join-Path $RepoRoot "ai-router-br"))
            if ($cv.Code -eq 0) { Write-Ok "claude plugin validate ai-router-br" } else { Write-Fail "claude plugin validate ai-router-br falhou: $($cv.Output)" }
        }
        foreach ($dir in @("ai-router-br", "codex\ai-router-br")) {
            $t = Invoke-Native node @((Join-Path $RepoRoot "$dir\scripts\run-tests.mjs"))
            $summary = (($t.Output -split "`n") | Where-Object { $_ -match '(tests|pass|fail) \d+\s*$' } | ForEach-Object { ($_ -replace '^[^a-z]*', '').Trim() }) -join ', '
            if ($t.Code -eq 0) { Write-Ok "testes $dir ($summary)" } else { Write-Fail "testes de $dir falharam ($summary). Detalhes: node $dir\scripts\run-tests.mjs" }
            $sa = Invoke-Native node @((Join-Path $RepoRoot "$dir\scripts\security-audit.mjs"))
            if ($sa.Code -eq 0) { Write-Ok "security audit $dir" } else { Write-Fail "security audit $dir falhou: $($sa.Output)" }
        }
    }

    # --- Doctor --------------------------------------------------------------
    if ($NodeOk -and (Test-Path (Join-Path $RepoRoot "ai-router-br\scripts\doctor.mjs"))) {
        Write-Step "Doctor do ai-router-br (sem valores de secrets)"
        (Invoke-Native node @((Join-Path $RepoRoot "ai-router-br\scripts\doctor.mjs"), "--root", $RepoRoot)).Output -split "`n" | ForEach-Object { Write-Host "   $_" }
    }

    # --- DeepSeek --------------------------------------------------------------
    Write-Step "DeepSeek (opcional: worker economico pago por API)"
    if (Test-EnvPresent 'DEEPSEEK_API_KEY') { Write-Ok "DEEPSEEK_API_KEY configurada (valor nao exibido)" }
    else {
        Write-Warn "DEEPSEEK_API_KEY nao configurada. Configure localmente (Configuracoes > Sistema > Sobre > Configuracoes avancadas > Variaveis de Ambiente > Usuario, ou seu gerenciador de secrets) e abra um novo terminal. Nunca cole a chave em chats, no Git, CLAUDE.md, AGENTS.md ou .ai-router/. Sem ela o router funciona com Claude + Codex."
    }

    # --- Resumo --------------------------------------------------------------
    Write-Host ""
    Write-Host "==================== Resumo ====================" -ForegroundColor Cyan
    if ($script:Failures.Count -eq 0) { Write-Host "Setup concluido$(if ($CheckOnly) { ' (check-only)' })." -ForegroundColor Green }
    else { Write-Host "Setup terminou com $($script:Failures.Count) falha(s):" -ForegroundColor Red; $script:Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red } }
    if ($script:Warnings.Count -gt 0) { Write-Host "Avisos ($($script:Warnings.Count)):" -ForegroundColor Yellow; $script:Warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow } }
    Write-Host ""
    Write-Host "Proximo passo: abra qualquer projeto no Claude Code ou no Codex e faca seu pedido normalmente."
    Write-Host "O ai-router-br se auto-inicializa no primeiro uso de cada projeto. Reinicie sessoes abertas para carregar plugins atualizados."
    if ($script:Failures.Count -gt 0) { return 1 }
    return 0
}

$exitCode = @(Invoke-Setup)[-1]
# exit only when run as a file; under "iwr ... | iex" it would close the user's window.
if ($PSCommandPath) { exit $exitCode }
