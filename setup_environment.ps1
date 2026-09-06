# ==============================================================================
#  LOYADHAM PIXEL PERFECT STUDIO - AUTOMATED TECH INSTALLER & BOOTSTRAPPER
# ==============================================================================
#  Automatically detects, downloads, and installs all missing technologies:
#  - Node.js LTS Runtime & npm (Zero-Admin Portable Setup)
#  - Cloudflare Tunnel (cloudflared.exe)
#  - Client Dependencies (client/node_modules) & Production Build (client/dist)
#  - Server Dependencies (server/node_modules)
# ==============================================================================

[CmdletBinding()]
param (
    [switch]$CheckOnly,
    [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $ScriptRoot "bin"
$NodeDir = Join-Path $BinDir "nodejs"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$CloudflaredExe = Join-Path $ScriptRoot "cloudflared.exe"

$ClientDir = Join-Path $ScriptRoot "client"
$ClientModules = Join-Path $ClientDir "node_modules"
$ClientDist = Join-Path $ClientDir "dist"

$ServerDir = Join-Path $ScriptRoot "server"
$ServerModules = Join-Path $ServerDir "node_modules"

function Write-Banner {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "     LOYADHAM PIXEL PERFECT - AUTOMATIC PC TECH INSTALLER       " -ForegroundColor Yellow -BackgroundColor Black
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Status($step, $text, $color="White") {
    Write-Host "[$step] " -ForegroundColor Cyan -NoNewline
    Write-Host "$text" -ForegroundColor $color
}

function Write-Success($text) {
    Write-Host "  [OK] " -ForegroundColor Green -NoNewline
    Write-Host "$text" -ForegroundColor Gray
}

function Write-Info($text) {
    Write-Host "  [i] " -ForegroundColor Yellow -NoNewline
    Write-Host "$text" -ForegroundColor White
}

function Write-Warn($text) {
    Write-Host "  [!] " -ForegroundColor DarkYellow -NoNewline
    Write-Host "$text" -ForegroundColor Yellow
}

function Write-Fail($text) {
    Write-Host "  [ERROR] " -ForegroundColor Red -NoNewline
    Write-Host "$text" -ForegroundColor Red
}

function Download-File($url, $destination) {
    Write-Host "  Downloading: $url" -ForegroundColor DarkGray
    $dir = Split-Path -Parent $destination
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Try curl.exe first (fastest, built-in on Windows 10/11)
    $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
    $curlPath = if ($curlCmd) { $curlCmd.Source } else { $null }
    if ($curlPath -and (Test-Path $curlPath)) {
        & $curlPath -L -o "$destination" "$url"
        if ($LASTEXITCODE -eq 0 -and (Test-Path $destination)) {
            return
        }
    }

    # Fallback to BITS or WebClient
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "PixelPerfect-Installer")
        $wc.DownloadFile($url, $destination)
    }
    catch {
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
    }
}

# Ensure session PATH includes local bin\nodejs if it already exists
if (Test-Path $NodeDir) {
    if ($env:PATH -notlike "*$NodeDir*") {
        $env:PATH = "$NodeDir;$env:PATH"
    }
}

Write-Banner

# ------------------------------------------------------------------------------
# 1. NODE.JS & NPM RUNTIME CHECK & AUTO-INSTALL
# ------------------------------------------------------------------------------
Write-Status "1/4" "Checking Node.js & npm runtime..."

$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

# Also check common Program Files paths if not in PATH
if (-not $NodeCommand) {
    $commonPaths = @(
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs"
    )
    foreach ($p in $commonPaths) {
        $candidate = Join-Path $p "node.exe"
        if (Test-Path $candidate) {
            $env:PATH = "$p;$env:PATH"
            $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
            $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
            break
        }
    }
}

if ($NodeCommand -and $NpmCommand -and -not $ForceInstall) {
    $nodeVer = (& node -v 2>$null).Trim()
    $npmVer = (& npm.cmd -v 2>$null).Trim()
    Write-Success "Node.js is installed: $nodeVer ($($NodeCommand.Source))"
    Write-Success "npm is installed: v$npmVer"
} else {
    Write-Warn "Node.js / npm runtime is NOT installed on this PC!"
    if ($CheckOnly) {
        Write-Host "Missing: Node.js runtime." -ForegroundColor Red
        return $false
    }

    Write-Info "Automatically downloading and setting up standalone Node.js LTS..."
    Write-Info "This requires ZERO admin rights and will not interfere with other apps."

    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }

    # Fetch latest LTS version or use stable default
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
    $ltsVersion = "v22.14.0" # Safe LTS fallback
    try {
        $nodeIndex = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing -TimeoutSec 5
        $foundLts = ($nodeIndex | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
        if ($foundLts) { $ltsVersion = $foundLts }
    } catch {
        Write-Info "Using verified LTS build: $ltsVersion"
    }

    $zipName = "node-$ltsVersion-$arch.zip"
    $downloadUrl = "https://nodejs.org/dist/$ltsVersion/$zipName"
    $tempZip = Join-Path $BinDir $zipName

    Write-Info "Downloading Node.js $ltsVersion ($arch)..."
    Download-File $downloadUrl $tempZip

    Write-Info "Extracting Node.js package..."
    $tempExtract = Join-Path $BinDir "temp_extract"
    if (Test-Path $tempExtract) { Remove-Item -Path $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    if (Test-Path $NodeDir) { Remove-Item -Path $NodeDir -Recurse -Force }
    Move-Item -Path $extractedFolder.FullName -Destination $NodeDir

    # Clean up temp files
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue

    # Configure session PATH
    $env:PATH = "$NodeDir;$env:PATH"

    # Register to User PATH environment permanently so it works across restarts
    try {
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$NodeDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$userPath;$NodeDir", "User")
            Write-Success "Registered Node.js to Windows User PATH."
        }
    } catch {
        Write-Warn "Could not write permanent User PATH. Session PATH active."
    }

    $installedVer = (& "$NodeExe" -v 2>$null).Trim()
    $installedNpm = (& "$NpmCmd" -v 2>$null).Trim()
    Write-Success "Node.js successfully configured: $installedVer"
    Write-Success "npm successfully configured: v$installedNpm"
}

# ------------------------------------------------------------------------------
# 2. CLOUDFLARE TUNNEL (cloudflared.exe)
# ------------------------------------------------------------------------------
Write-Host ""
Write-Status "2/4" "Checking Cloudflare Tunnel (for 5G phone live streaming)..."
if (Test-Path $CloudflaredExe) {
    Write-Success "Cloudflare Tunnel binary present."
} else {
    Write-Warn "Cloudflare Tunnel binary missing."
    if ($CheckOnly) {
        Write-Host "Missing: Cloudflare Tunnel." -ForegroundColor Red
        return $false
    }
    Write-Info "Downloading cloudflared-windows-amd64.exe..."
    $tunnelUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Download-File $tunnelUrl $CloudflaredExe
    if (Test-Path $CloudflaredExe) {
        Write-Success "Cloudflare Tunnel downloaded successfully."
    } else {
        Write-Fail "Failed to download Cloudflare Tunnel."
    }
}

# ------------------------------------------------------------------------------
# 3. CLIENT DEPENDENCIES & DASHBOARD BUILD
# ------------------------------------------------------------------------------
Write-Host ""
Write-Status "3/4" "Checking Client Dashboard dependencies..."

$npmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmExec = if ($npmCmdObj) { $npmCmdObj.Source } else { $null }
if (-not $npmExec -and (Test-Path $NpmCmd)) { $npmExec = $NpmCmd }

if (-not (Test-Path $ClientModules)) {
    Write-Warn "Client node_modules missing. Installing dashboard dependencies..."
    if ($CheckOnly) {
        Write-Host "Missing: Client dependencies." -ForegroundColor Red
        return $false
    }
    Push-Location $ClientDir
    & $npmExec install --no-audit --no-fund
    Pop-Location
    Write-Success "Client dependencies installed successfully."
} else {
    Write-Success "Client dependencies are already installed."
}

# Check if client/dist exists
if (-not (Test-Path (Join-Path $ClientDist "index.html"))) {
    Write-Info "Building client dashboard for production..."
    Push-Location $ClientDir
    & $npmExec run build
    Pop-Location
    Write-Success "Client dashboard built successfully."
} else {
    Write-Success "Client dashboard production build ready."
}

# ------------------------------------------------------------------------------
# 4. SERVER DEPENDENCIES
# ------------------------------------------------------------------------------
Write-Host ""
Write-Status "4/4" "Checking Server Backend dependencies..."

if (-not (Test-Path $ServerModules)) {
    Write-Warn "Server node_modules missing. Installing backend dependencies..."
    if ($CheckOnly) {
        Write-Host "Missing: Server dependencies." -ForegroundColor Red
        return $false
    }
    Push-Location $ServerDir
    & $npmExec install --no-audit --no-fund
    Pop-Location
    Write-Success "Server dependencies installed successfully."
} else {
    Write-Success "Server dependencies are already installed."
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "     ALL REQUIRED TECHNOLOGIES ARE READY & CONFIGURED!          " -ForegroundColor Yellow -BackgroundColor Black
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  System is ready to run on this PC." -ForegroundColor Cyan
Write-Host ""

return $true
