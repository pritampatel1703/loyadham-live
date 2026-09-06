<# :
@echo off
color 0b
title LOYADHAM PIXEL PERFECT - LOCAL EVENT SERVER
set "ROOT=%~dp0"

echo ===================================================================
echo           LOYADHAM PIXEL PERFECT - LOCAL EVENT SERVER
echo ===================================================================
echo.

:: 1. Run the embedded automatic tech detector and installer
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('%~f0'))"
if %ERRORLEVEL% NEQ 0 (
    color 0c
    echo.
    echo ===================================================================
    echo [ERROR] Tech setup encountered an error. Please review output above.
    echo ===================================================================
    pause
    exit /b 1
)

:: 2. Ensure environment PATH has Node.js
if exist "%ROOT%bin\nodejs" set "PATH=%ROOT%bin\nodejs;%PATH%"
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: 3. Clean up previous processes
echo [*] Cleaning up previous background processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo.

:: 4. Start Loyadham Server in a separate window
echo [*] Starting Loyadham Server on Port 4000...
start "Loyadham Server" call "%ROOT%_run_server.bat"

:: Wait for the server to bind port 4000
ping 127.0.0.1 -n 4 >nul

:: 5. Launch Cloudflare Tunnel and display QR Code & Network info
echo [*] Generating Local Network and Public 5G Cloudflare Tunnel...
pushd "%ROOT%server"
node print_info.js
popd

echo.
echo ===================================================================
echo Event server session has ended.
echo ===================================================================
pause
exit /b
#>

# ------------------------------------------------------------------------------
# POWERSHELL EMBEDDED ENGINE: TECH DETECTION & AUTO-INSTALLATION
# ------------------------------------------------------------------------------
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptRoot = $env:ROOT
if (-not $ScriptRoot) { $ScriptRoot = (Get-Location).Path }
$ScriptRoot = $ScriptRoot.TrimEnd('\')

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

    $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
    $curlPath = if ($curlCmd) { $curlCmd.Source } else { $null }
    if ($curlPath -and (Test-Path $curlPath)) {
        & $curlPath -L -o "$destination" "$url"
        if ($LASTEXITCODE -eq 0 -and (Test-Path $destination)) { return }
    }

    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "PixelPerfect-Installer")
        $wc.DownloadFile($url, $destination)
    }
    catch {
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
    }
}

# Add local bin\nodejs to session PATH if it exists
if (Test-Path $NodeDir) {
    if ($env:PATH -notlike "*$NodeDir*") {
        $env:PATH = "$NodeDir;$env:PATH"
    }
}

# 1. NODE.JS & NPM CHECK
Write-Status "1/4" "Checking Node.js & npm runtime..."
$NodeCmdObj = Get-Command node.exe -ErrorAction SilentlyContinue
$NpmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $NodeCmdObj) {
    $candidates = @(
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs"
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "node.exe")) {
            $env:PATH = "$c;$env:PATH"
            $NodeCmdObj = Get-Command node.exe -ErrorAction SilentlyContinue
            $NpmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue
            break
        }
    }
}

if ($NodeCmdObj -and $NpmCmdObj) {
    $nodeVer = (& node -v 2>$null).Trim()
    $npmVer = (& npm.cmd -v 2>$null).Trim()
    Write-Success "Node.js detected: $nodeVer"
    Write-Success "npm detected: v$npmVer"
} else {
    Write-Warn "Node.js runtime not installed on this PC!"
    Write-Info "Downloading standalone Node.js LTS (zero-admin required)..."

    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
    $ltsVer = "v22.14.0"
    try {
        $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing -TimeoutSec 5
        $found = ($index | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
        if ($found) { $ltsVer = $found }
    } catch {
        Write-Info "Using verified LTS build: $ltsVer"
    }

    $zipFile = Join-Path $BinDir "node-$ltsVer-$arch.zip"
    $nodeUrl = "https://nodejs.org/dist/$ltsVer/node-$ltsVer-$arch.zip"

    Download-File $nodeUrl $zipFile

    Write-Info "Extracting standalone Node.js..."
    $extractDir = Join-Path $BinDir "temp_extract"
    if (Test-Path $extractDir) { Remove-Item -Path $extractDir -Recurse -Force }
    Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

    $subfolder = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (Test-Path $NodeDir) { Remove-Item -Path $NodeDir -Recurse -Force }
    Move-Item -Path $subfolder.FullName -Destination $NodeDir

    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue

    $env:PATH = "$NodeDir;$env:PATH"

    try {
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$NodeDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$userPath;$NodeDir", "User")
            Write-Success "Registered Node.js to Windows User PATH."
        }
    } catch {}

    $installedVer = (& "$NodeExe" -v 2>$null).Trim()
    Write-Success "Node.js successfully installed portably: $installedVer"
}

# 2. CLOUDFLARE TUNNEL CHECK
Write-Host ""
Write-Status "2/4" "Checking Cloudflare Tunnel (for 5G mobile live streaming)..."
if (Test-Path $CloudflaredExe) {
    Write-Success "Cloudflare Tunnel binary present."
} else {
    Write-Warn "Cloudflare Tunnel binary missing. Downloading..."
    $tunnelUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Download-File $tunnelUrl $CloudflaredExe
    if (Test-Path $CloudflaredExe) {
        Write-Success "Cloudflare Tunnel downloaded successfully."
    } else {
        Write-Warn "Could not download Cloudflare Tunnel. 5G tunnel may be unavailable."
    }
}

# 3. CLIENT DASHBOARD CHECK
Write-Host ""
Write-Status "3/4" "Checking Client Dashboard dependencies..."
$npmCmdRunner = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmExecPath = if ($npmCmdRunner) { $npmCmdRunner.Source } else { $NpmCmd }

if (-not (Test-Path $ClientModules)) {
    Write-Warn "Client node_modules missing. Installing dashboard dependencies..."
    Push-Location $ClientDir
    & $npmExecPath install --no-audit --no-fund
    Pop-Location
    Write-Success "Client dependencies installed successfully."
} else {
    Write-Success "Client dependencies are already installed."
}

if (-not (Test-Path (Join-Path $ClientDist "index.html"))) {
    Write-Info "Building client dashboard production bundle..."
    Push-Location $ClientDir
    & $npmExecPath run build
    Pop-Location
    Write-Success "Client dashboard production build ready."
} else {
    Write-Success "Client dashboard production build ready."
}

# 4. SERVER BACKEND CHECK
Write-Host ""
Write-Status "4/4" "Checking Server Backend dependencies..."
if (-not (Test-Path $ServerModules)) {
    Write-Warn "Server node_modules missing. Installing backend dependencies..."
    Push-Location $ServerDir
    & $npmExecPath install --no-audit --no-fund
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

exit 0
