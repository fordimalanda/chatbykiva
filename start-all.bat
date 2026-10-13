@echo off
title KivaSocial - Lanceur Global
echo ========================================================
echo        KivaSocial - Reseau Social avec KivaDB
echo ========================================================
echo Verification : assurez-vous que KivaDB tourne deja (kivadb start)
echo.
echo Demarrage du Backend NestJS dans une nouvelle fenetre...
start "KivaSocial Backend" cmd /c "cd /d "%~dp0backend" && npm run start:dev"

echo Demarrage du Frontend Next.js dans une nouvelle fenetre...
start "KivaSocial Frontend" cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Les 2 serveurs sont lances !
echo - PC Local  : http://localhost:3000
echo - Smartphone: http://192.168.1.68:3000 (sur le meme Wi-Fi)
echo - Backend   : http://localhost:4000
echo - KivaDB    : http://localhost:8080 (REST) / 2911 (TCP)
echo.
pause
