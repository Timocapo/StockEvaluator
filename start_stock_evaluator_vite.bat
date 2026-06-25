@echo off
setlocal

REM ============================================================
REM Stock Evaluator Launcher - Backend + Vite Frontend
REM Put this file inside the stock-evaluator folder.
REM ============================================================

cd /d "%~dp0"

echo Launcher folder: %CD%
echo.

if not exist "backend\server.js" (
    echo ERROR: backend\server.js not found.
    pause
    exit /b 1
)

if not exist "frontend\package.json" (
    echo ERROR: frontend\package.json not found.
    pause
    exit /b 1
)

if not exist "backend\.env" (
    echo WARNING: backend\.env was not found.
    echo Prices will show as $0.00 until your Finnhub key is configured.
    echo.
    set /p RUN_SETUP="Run setup_local_env.bat now? Type Y to set API keys, or press Enter to continue: "
    if /I "%RUN_SETUP%"=="Y" (
        call "%~dp0setup_local_env.bat"
    )
    echo.
)

echo Starting backend...
start "Stock Evaluator Backend" cmd /k "cd /d ""%~dp0backend"" && npm install --registry=https://registry.npmjs.org/ && npm start"

echo Starting frontend...
start "Stock Evaluator Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm install --registry=https://registry.npmjs.org/ && npm run dev"

echo.
echo Started backend and frontend.
echo Backend should be on http://localhost:3001
echo Frontend is usually on http://localhost:5173
echo.
pause
