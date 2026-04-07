@echo off
REM Hephaestus Startup Script (Windows)
REM Starts the agent as a background process for 24/7 operation

setlocal

set "AGENT_DIR=%~dp0"
set "LOG_FILE=%AGENT_DIR%hephaestus.log"

echo Starting Hephaestus...
echo Log file: %LOG_FILE%

REM Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed
    exit /b 1
)

REM Install dependencies if needed
if not exist "%AGENT_DIR%node_modules" (
    echo Installing dependencies...
    cd /d "%AGENT_DIR%"
    call npm install
)

REM Start the agent in background
cd /d "%AGENT_DIR%"
start /b cmd /c "npm run start:daemon > \"%LOG_FILE%\" 2>&1"

echo Hephaestus started
echo.
echo Commands:
echo   View logs:   type %LOG_FILE%
echo   Stop:        taskkill /IM node.exe /F
