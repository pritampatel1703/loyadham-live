@echo off
color 0b
set "ROOT=%~dp0"

echo ===================================================
echo     LOYADHAM PIXEL PERFECT - LOCAL EVENT SERVER
echo ===================================================
echo.

echo Cleaning up previous background processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo.

echo [1/4] Building latest dashboard...
pushd "%ROOT%client"
call npm run build
popd

echo.
echo [2/4] Preparing server...
pushd "%ROOT%server"
call npm install
popd

echo.
echo [3/4] Checking Cloudflare Tunnel (for 5G phones)...
if not exist "%ROOT%cloudflared.exe" (
    echo Downloading Cloudflare Tunnel... please wait...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%ROOT%cloudflared.exe'"
)

echo.
echo [4/4] Starting Server and Public Tunnel...

:: Start the server in a separate window using the helper script
:: We use 'call' to prevent Windows from stripping the quotes around %ROOT%
start "Loyadham Server" call "%ROOT%_run_server.bat"

:: Wait for the server to boot up safely
ping 127.0.0.1 -n 4 >nul

:: Launch the Node.js helper that prints IP, QR code, and handles Cloudflare
pushd "%ROOT%server"
node print_info.js
popd

echo.
echo Startup complete. If the server window did not open, read the errors above.
pause
