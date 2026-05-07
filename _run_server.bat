@echo off
:: This helper is called by start_event.bat to run the server
:: It receives the server path as argument %1
pushd %1
set ENABLE_RTMP=true
set PORT=4000
echo.
echo ============================================
echo   LOYADHAM SERVER RUNNING ON PORT 4000
echo   (Keep this window open during the event)
echo ============================================
echo.
node server.js
pause
