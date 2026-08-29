@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js 22 LTS。
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto :fail

call npm run verify
if errorlevel 1 goto :fail

if exist dist rmdir /s /q dist
call npm run pack:win
if errorlevel 1 goto :fail

echo.
echo 打包完成，EXE 位于：
echo %CD%\dist
explorer "%CD%\dist"
pause
exit /b 0

:fail
echo.
echo 打包失败，请把窗口最后的错误截图发给我。
pause
exit /b 1
