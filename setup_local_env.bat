@echo off
setlocal EnableExtensions

REM ============================================================
REM Local Environment Setup - Stock Evaluator
REM Creates backend\.env for local Windows testing.
REM Do NOT commit backend\.env to GitHub.
REM ============================================================

cd /d "%~dp0"

echo.
echo Stock Evaluator local API key setup
echo -----------------------------------
echo This creates backend\.env on this computer only.
echo Do NOT upload backend\.env to GitHub.
echo.

if not exist "backend" (
    echo ERROR: backend folder not found. Run this from the project root.
    pause
    exit /b 1
)

if exist "backend\.env" (
    echo backend\.env already exists.
    set /p OVERWRITE="Overwrite it? Type Y to overwrite, or press Enter to cancel: "
    if /I not "%OVERWRITE%"=="Y" (
        echo Cancelled. No changes made.
        pause
        exit /b 0
    )
)

set /p FINNHUB_KEY="Paste your Finnhub API key: "
if "%FINNHUB_KEY%"=="" (
    echo ERROR: Finnhub API key is required for prices.
    pause
    exit /b 1
)

set /p TWELVE_KEY="Paste your Twelve Data API key, or press Enter to skip charts: "
set /p OPENAI_KEY="Paste your OpenAI API key, or press Enter to leave AI disabled: "

if not exist "backend\data" mkdir "backend\data"

(
    echo FINNHUB_API_KEY=%FINNHUB_KEY%
    echo TWELVE_DATA_API_KEY=%TWELVE_KEY%
    echo OPENAI_API_KEY=%OPENAI_KEY%
    echo PAPER_TRADING_DATA_DIR=./data
    echo NODE_ENV=development
    echo SERVE_FRONTEND=false
    echo QUOTE_CACHE_MS=300000
    echo CLOSED_MARKET_QUOTE_CACHE_MS=3600000
    echo NEWS_CACHE_MS=900000
    echo FINNHUB_REQUEST_DELAY_MS=250
    echo PAPER_TRADING_IGNORE_MARKET_HOURS=false
) > "backend\.env"

echo.
echo Created backend\.env successfully.
echo.
echo Next steps:
echo 1. Run start_stock_evaluator_vite.bat
echo 2. Open http://localhost:3001/api/health
echo 3. Confirm hasFinnhubKey is true
echo.
pause
