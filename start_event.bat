@echo off
color 0b
title LOYADHAM PIXEL PERFECT - EVENT SERVER
set "ROOT=%~dp0"

echo ===================================================
echo     LOYADHAM PIXEL PERFECT - LOCAL EVENT SERVER
echo ===================================================
echo.

:: 1. Prepend local portable Node.js and standard paths to PATH if they exist
if exist "%ROOT%bin\nodejs" set "PATH=%ROOT%bin\nodejs;%PATH%"
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;%PATH%"

:: 2. Check if any required tech or dependencies are missing on this PC
set "NEED_SETUP=0"

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 set "NEED_SETUP=1"

where npm.cmd >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where npm >nul 2>&1
    if %ERRORLEVEL% NEQ 0 set "NEED_SETUP=1"
)

if not exist "%ROOT%cloudflared.exe" set "NEED_SETUP=1"
if not exist "%ROOT%client\node_modules" set "NEED_SETUP=1"
if not exist "%ROOT%client\dist\index.html" set "NEED_SETUP=1"
if not exist "%ROOT%server\node_modules" set "NEED_SETUP=1"

:: 3. If anything is missing, run automated PC setup and installation
if "%NEED_SETUP%"=="1" (
    echo [!] Missing required technology or dependencies detected on this PC.
    echo [*] Starting automatic installer and environment setup...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%setup_environment.ps1"
    if %ERRORLEVEL% NEQ 0 (
        color 0c
        echo.
        echo [ERROR] Automatic environment installation failed.
        echo Please make sure this PC is connected to the internet.
        pause
        exit /b 1
    )
    :: Refresh PATH in case Node was just downloaded to bin\nodejs
    if exist "%ROOT%bin\nodejs" set "PATH=%ROOT%bin\nodejs;%PATH%"
    echo.
)

:: 4. Clean up any leftover processes from previous runs
echo [*] Cleaning up previous background processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo.

:: 5. Launch the Server in a separate window
echo [*] Starting Loyadham Server on Port 4000...
start "Loyadham Server" call "%ROOT%_run_server.bat"

:: Wait for the server to boot up safely
ping 127.0.0.1 -n 4 >nul

:: 6. Launch the Cloudflare Tunnel and QR Code Info Display
echo [*] Generating Local Network and Public 5G Cloudflare Tunnel...
pushd "%ROOT%server"
node print_info.js
popd

echo.
echo ===================================================
echo Event server session has ended.
echo ===================================================
pause
