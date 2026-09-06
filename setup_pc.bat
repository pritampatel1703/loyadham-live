@echo off
color 0b
title LOYADHAM PIXEL PERFECT - PC SETUP & INSTALLER
set "ROOT=%~dp0"

echo =================================================================
echo        LOYADHAM PIXEL PERFECT - AUTOMATED PC SETUP
echo =================================================================
echo.
echo This wizard will automatically inspect your PC and install all
echo required technologies (Node.js, npm, dependencies, and tools).
echo.
echo Please wait...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%setup_environment.ps1"
if %ERRORLEVEL% NEQ 0 (
    color 0c
    echo.
    echo =================================================================
    echo [ERROR] Setup encountered an issue. Please check the log above.
    echo =================================================================
    echo.
    pause
    exit /b 1
)

echo.
echo =================================================================
echo [SUCCESS] Your PC is 100%% ready to run Pixel Perfect Studio!
echo =================================================================
echo.
set /p START_NOW="Do you want to start the event server right now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    call "%ROOT%start_event.bat"
) else (
    echo.
    echo You can start the server anytime by double-clicking 'start_event.bat'.
    pause
)
