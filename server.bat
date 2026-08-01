@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "APP_ROOT=%~dp0"
set "PID_FILE=%APP_ROOT%.fingertip-server.pid"
set "LOG_FILE=%APP_ROOT%.fingertip-server.log"
set "ERROR_LOG_FILE=%APP_ROOT%.fingertip-server-error.log"
set "APP_URL=http://127.0.0.1:5173"

if /i "%~1"=="start" goto start
if /i "%~1"=="stop" goto stop
if /i "%~1"=="status" goto status
if /i "%~1"=="restart" goto restart
goto menu

:menu
echo.
echo  Fingertip server control
echo  [1] Start server
echo  [2] Stop server
echo  [3] Restart server
echo  [4] Status
echo  [Q] Quit
choice /c 1234Q /n /m "Choose: "
if errorlevel 5 exit /b 0
if errorlevel 4 goto status
if errorlevel 3 goto restart
if errorlevel 2 goto stop
goto start

:start
call :is_running
if not errorlevel 1 (
  echo [Fingertip] Server is already running at %APP_URL%
  if not defined FINGERTIP_CHECK_ONLY start "Fingertip browser" "%APP_URL%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo [Fingertip] Node.js is not installed.
  echo Install Node.js from https://nodejs.org and run this file again.
  exit /b 1
)

if not exist "%APP_ROOT%node_modules\.bin\vite.cmd" (
  echo [Fingertip] Installing required packages for the first run...
  where pnpm >nul 2>nul
  if not errorlevel 1 (call pnpm install) else (call npm install)
  if errorlevel 1 (
    echo [Fingertip] Package installation failed.
    exit /b 1
  )
)

if defined FINGERTIP_CHECK_ONLY (
  echo [Fingertip] Start check passed.
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Get-Location).Path; $node=(Get-Command node).Source; $out=Join-Path $root '.fingertip-server.log'; $err=Join-Path $root '.fingertip-server-error.log'; $pidFile=Join-Path $root '.fingertip-server.pid'; $p=Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -LiteralPath $pidFile -Value $p.Id -Encoding ascii"
timeout /t 2 /nobreak >nul
call :is_running
if errorlevel 1 (
  echo [Fingertip] Server failed to start. See .fingertip-server.log
  exit /b 1
)
echo [Fingertip] Server started at %APP_URL%
if not defined FINGERTIP_NO_BROWSER start "Fingertip browser" "%APP_URL%"
exit /b 0

:stop
if not exist "%PID_FILE%" (
  echo [Fingertip] No server started by this project was found.
  exit /b 0
)
set /p SERVER_PID=<"%PID_FILE%"
taskkill /PID %SERVER_PID% /T /F >nul 2>nul
del /q "%PID_FILE%" >nul 2>nul
echo [Fingertip] Server stopped.
exit /b 0

:restart
call :stop
call :start
exit /b %errorlevel%

:status
call :is_running
if not errorlevel 1 (
  echo [Fingertip] Server is running at %APP_URL%
) else (
  echo [Fingertip] Server is stopped.
)
exit /b 0

:is_running
if not exist "%PID_FILE%" exit /b 1
set /p SERVER_PID=<"%PID_FILE%"
tasklist /FI "PID eq %SERVER_PID%" /NH | findstr /r /c:"%SERVER_PID%" >nul
if errorlevel 1 exit /b 1
exit /b 0
