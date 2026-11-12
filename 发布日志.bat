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

echo [1/3] 暂存改动...
"%GIT%" add -A
"%GIT%" diff --cached --quiet
if not errorlevel 1 goto nothing

echo [2/3] 提交...
"%GIT%" commit -m "更新日志 %DATE% %TIME%"
if errorlevel 1 goto fail

echo [3/3] 推送...
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