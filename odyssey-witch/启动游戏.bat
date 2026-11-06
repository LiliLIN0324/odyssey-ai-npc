@echo off
title Odyssey - Aia Island
set "HERE=%~dp0"

rem Already running? just open the page
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:8765"
  exit /b
)

echo Starting Aia Island ...
wscript.exe "%HERE%start-service.vbs"
set /a waited=0
:waitloop
timeout /t 1 >nul
set /a waited+=1
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto ready
if %waited% geq 15 goto timeout
goto waitloop

:ready
start "" "http://localhost:8765"
echo Ready! If the browser did not open, visit http://localhost:8765
echo To stop the service, end the python process in Task Manager.
timeout /t 6 >nul
exit /b

:timeout
echo Timeout: check that "py -3" works and key.txt exists in odyssey-witch or its parent folder.
pause
exit /b 1
