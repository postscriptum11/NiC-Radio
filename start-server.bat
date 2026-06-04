@echo off
title NiC Radio - Lokalny Serwer
color 0b
echo.
echo  =====================================================
echo   NiC Radio - Lokalny Serwer HTTP
echo  =====================================================
echo.
echo  Serwer zostal uruchomiony na porcie 8000.
echo  Otworz przegladarke i wejdz na:
echo.
echo     http://localhost:8000
echo.
echo  Haslo: nudne-radio
echo.
echo  Aby zatrzymac serwer, nacisnij Ctrl+C.
echo  =====================================================
echo.
cd /d "%~dp0"
python -m http.server 8000
pause
