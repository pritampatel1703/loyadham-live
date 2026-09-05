@echo off
color 0c
echo ===================================================
echo     LOYADHAM PIXEL PERFECT - STOPPING EVENT
echo ===================================================
echo.

echo [1/3] Stopping Cloudflare Tunnel...
taskkill /F /IM cloudflared.exe >nul 2>&1

echo [2/3] Stopping Node Servers...
taskkill /F /IM node.exe >nul 2>&1

echo [3/3] Forcibly clearing network ports (4000, 8009, 1935)...
powershell -Command "Get-NetTCPConnection -LocalPort 4000,8009,1935 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo All background processes and servers have been successfully stopped.
echo You can safely close this window.
pause
