@echo off
rem Senify starten: Datenbank hochfahren (falls noetig), Portal im eigenen
rem Fenster starten und den Browser oeffnen.
rem
rem Aufruf:  start-senify.cmd            Datenbank + Portal + Browser
rem          start-senify.cmd noopen     ohne Browser (fuer Tests)
rem
rem Die Datenbank ist die mitgelieferte Instanz in %USERPROFILE%\.senify\pg
rem (Port 5433, so steht es in %USERPROFILE%\.senify\config.json).
rem Das Fenster "Senify Portal" bleibt offen und zeigt das Protokoll; darin
rem beendet Strg+C das Portal.

setlocal
title Senify starten

rem %~dp0 endet mit einem Backslash; der vor einer schliessenden Anfuehrung
rem stoert die Argumenterkennung von "start", deshalb abschneiden.
set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PG_DATA=%USERPROFILE%\.senify\pg"
set "PG_PORT=5433"
set "APP_URL=http://127.0.0.1:4322"

if not exist "%PG_BIN%\pg_ctl.exe" (
  echo PostgreSQL 18 wurde nicht gefunden: "%PG_BIN%"
  echo Bitte den Pfad im Skript anpassen.
  pause
  exit /b 1
)
if not exist "%PG_DATA%\PG_VERSION" (
  echo Das Senify-Datenverzeichnis fehlt: "%PG_DATA%"
  pause
  exit /b 1
)

"%PG_BIN%\pg_ctl.exe" status -D "%PG_DATA%" >nul 2>&1
if errorlevel 1 (
  echo Starte die Datenbank ...
  "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%USERPROFILE%\.senify\pg.log" -o "-p %PG_PORT%" start
  if errorlevel 1 (
    echo Die Datenbank konnte nicht starten. Details: "%USERPROFILE%\.senify\pg.log"
    pause
    exit /b 1
  )
) else (
  echo Datenbank laeuft bereits.
)

rem Das Portal im eigenen Fenster: dort laeuft das Protokoll, Strg+C beendet es.
if /I not "%~1"=="noportal" (
  echo Starte das Portal ...
  start "Senify Portal" /D "%REPO%" cmd /k "pnpm senify start"
)

echo Warte auf das Portal ...
powershell -NoProfile -Command "$end=(Get-Date).AddSeconds(150); while ((Get-Date) -lt $end) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%APP_URL%/api/sites' | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 700 } }; exit 1"
if errorlevel 1 (
  echo Das Portal antwortet nicht. Sieh im Fenster "Senify Portal" nach.
  pause
  exit /b 1
)

echo Portal laeuft: %APP_URL%
if /I "%~1"=="noopen" exit /b 0
start "" "%APP_URL%"
exit /b 0
