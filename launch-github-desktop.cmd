@echo off
setlocal
set ELECTRON_RUN_AS_NODE=

if exist "%~dp0dist\GitDesktop-win32-x64\GitDesktop.exe" (
  start "" "%~dp0dist\GitDesktop-win32-x64\GitDesktop.exe" %*
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
