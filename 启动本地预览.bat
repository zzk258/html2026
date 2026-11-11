@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [INFO] Node.js not found - auto-write is unavailable.
  echo        Manual mode still works: copy attachment files into 更新日志\files\^<log id^>\
  echo        The exact folder is shown in the editor ^(button: 复制路径^).
  pause
  exit /b 1
)
start "" "http://localhost:8123/home.html"
node "更新日志\本地预览.js" 8123
pause