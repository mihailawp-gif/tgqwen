@echo off
echo ========================================
echo Telegram Cases Mini App - Startup
echo ========================================
echo.

if not exist .env (
    echo ERROR: .env file not found!
    pause
    exit /b 1
)

if not exist database\cases.db (
    echo Database not found. Initializing...
    python database\init_db.py
)

echo.
echo ========================================
echo Starting services (HTTPS on port 8443)
echo ========================================
echo.
echo SSL cert will be auto-generated in ssl/ folder
echo on first run if not present.
echo.
echo BotFather setup:
echo   1. /newapp or /setmenubutton
echo   2. URL: https://YOUR_IP:8443
echo      (use your real local IP, not localhost)
echo.
pause

start "Cases Web Server (HTTPS)" cmd /k "python server.py"
timeout /t 2 /nobreak >nul

start "Cases Main Bot" cmd /k "python bot\main.py"
timeout /t 2 /nobreak >nul

start "Cases Admin Bot" cmd /k "python bot\admin_bot.py"

echo.
echo All services started on HTTPS!
echo.
pause >nul
