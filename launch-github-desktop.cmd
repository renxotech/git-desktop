@echo off
setlocal
set ELECTRON_RUN_AS_NODE=

set "DESKTOP_LOCAL_EXECUTABLE="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\find-local-build.ps1"`) do set "DESKTOP_LOCAL_EXECUTABLE=%%I"
if exist "%DESKTOP_LOCAL_EXECUTABLE%" (
  start "" "%DESKTOP_LOCAL_EXECUTABLE%" %*
  exit /b 0
)

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron is missing. Install the repository dependencies before launching.
  pause
  exit /b 1
)

if not exist "%~dp0out\main.js" (
  echo The local application bundle is missing. Build it before launching.
  pause
  exit /b 1
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0out" %*
