@echo off
mode con: cols=68 lines=14
cd /d "%~dp0"
echo.
echo Sky Pilot MVP - Telegram Mini App
echo.
echo WebApp: http://localhost:3000
echo Admin : http://localhost:3000/admin/
echo.
echo Se for usar Telegram, mantenha o ngrok apontando para 3000.
echo.
npm start
pause
