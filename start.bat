@echo off
title Mini SIS launcher
if not exist "%~dp0server\.env" copy "%~dp0server\.env.example" "%~dp0server\.env" >nul

cd /d "%~dp0server"
if not exist node_modules call npm install
start "Mini SIS - API (keep open)" cmd /k "npm start"

cd /d "%~dp0client"
if not exist node_modules call npm install
start "Mini SIS - Web (keep open)" cmd /k "npm start"

echo.
echo Two windows have opened: API and Web. Keep both open.
echo Wait for "Local: http://localhost:5173/" in the Web window, then open it in your browser.
echo Login: omar@uni.test / password123
pause
