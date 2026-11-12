@echo off
if exist "%SystemRoot%\System32\chcp.com" "%SystemRoot%\System32\chcp.com" 65001 >nul 2>nul
setlocal
cd /d "%~dp0"

set "GIT=git"
where git >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT=C:\Program Files\Git\cmd\git.exe"
  ) else (
    echo [ERR] 没找到 git，请确认安装了 Git for Windows。
    pause
    exit /b 1
  )
)

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "更新日志\.sync-ok" del /q "更新日志\.sync-ok"

if exist "%PS%" (
  echo [1/4] 从下载目录同步最新导出...
  "%PS%" -NoProfile -ExecutionPolicy Bypass -File "更新日志\同步导出.ps1"
  echo.
) else (
  echo [1/4] 没找到 Windows PowerShell，跳过自动同步。
  echo       请手动把导出的 net.json / ops.json 覆盖到 更新日志\data\
  echo.
)

if exist "更新日志\.sync-ok" (
  echo [2/4] 清理已删除日志留下的附件...
  "%PS%" -NoProfile -ExecutionPolicy Bypass -File "更新日志\清理附件.ps1" -Apply
  del /q "更新日志\.sync-ok"
  echo.
) else (
  echo [2/4] 本次没有同步到新导出，跳过清理（避免误删刚放进 files 的附件）。
  echo.
)

echo [3/4] 暂存改动...
"%GIT%" add -A
"%GIT%" diff --cached --quiet
if not errorlevel 1 goto nothing

echo [4/4] 提交并推送...
"%GIT%" commit -m "更新日志 %DATE% %TIME%"
if errorlevel 1 goto fail

"%GIT%" push
if errorlevel 1 goto fail

echo.
echo 完成。等 1-2 分钟刷新 https://zzk258.github.io/html2026/
pause
exit /b 0

:nothing
echo 没有需要提交的改动。
echo 先在浏览器里点「导出」，把 json 覆盖到 更新日志\data\，附件放进 更新日志\files\，再运行本脚本。
pause
exit /b 0

:fail
echo 执行失败，请查看上面的报错信息。
pause
exit /b 1