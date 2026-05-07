@echo off
color 0b
set "ROOT=%~dp0"

echo ===================================================
echo     LOYADHAM PIXEL PERFECT - LOCAL EVENT SERVER
echo ===================================================
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

:: Start the server in a separate window using helper script
start "Loyadham Server" "%ROOT%_run_server.bat" "%ROOT%server"

:: Wait for the server to boot up safely
ping 127.0.0.1 -n 4 >nul

echo.
echo ===================================================
echo   SERVER IS READY! (Keep BOTH windows open)
echo.
echo   1. DASHBOARD (Your Laptop):
echo      http://localhost:4000
echo.
echo   2. DJI / GOPRO (Local Wi-Fi RTMP):
echo      rtmp://YOUR-IP:1935/live/dji1
echo.
echo   3. MOBILE PHONES (4G/5G or Wi-Fi):
echo      See the trycloudflare.com link below!
echo ===================================================
echo.
echo Generating public link for mobile phones...
echo (Press Ctrl+C to stop when the event is over)
echo.
"%ROOT%cloudflared.exe" tunnel --url http://localhost:4000
pause
