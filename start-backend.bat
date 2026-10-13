@echo off
title KivaSocial - Backend NestJS (Port 4000)
cd /d "%~dp0backend"
echo [BACKEND] Demarrage du Backend NestJS connecte a KivaDB (social_app)...
npm run start:dev
pause
