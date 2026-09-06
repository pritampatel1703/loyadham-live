@echo off
:: This helper is called by start_event.bat to run the server
:: Ensure local Node.js runtime is found if installed portably
if exist "%~dp0bin\nodejs" set "PATH=%~dp0bin\nodejs;%PATH%"
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;%PATH%"

:: It automatically enters the server directory
pushd "%~dp0server"
set ENABLE_RTMP=true
set RTMP_HTTP_PORT=8009
set PORT=4000
set NODE_ENV=production
echo.
echo ============================================
echo   LOYADHAM SERVER RUNNING ON PORT 4000
echo   (Keep this window open during the event)
echo ============================================
echo.
node server.js
pause
