@echo off
title Mini SIS demo data
cd /d "%~dp0server"
if not exist node_modules call npm install
call npm run seed
echo.
echo Done. Demo logins use password: password123
pause
