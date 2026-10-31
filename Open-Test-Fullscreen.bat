@echo off
setlocal

set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE_PATH%" (
    echo Microsoft Edge was not found in the standard install folders.
    pause
    exit /b 1
)

rem Use a separate Edge profile so an already-open browser cannot absorb the kiosk launch.
start "" "%EDGE_PATH%" --user-data-dir="%TEMP%\CBT-Edge-Kiosk" --kiosk "http://localhost:3000" --edge-kiosk-type=fullscreen --no-first-run
