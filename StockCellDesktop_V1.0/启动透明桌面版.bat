@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js 22 LTS：https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules\electron (
  echo 第一次运行，正在安装 Electron 依赖...
  call npm install
  if errorlevel 1 goto :fail
)

echo 正在启动 A股资金细胞透明桌面版...
call npm start
exit /b %errorlevel%

:fail
echo.
echo 依赖安装失败，请检查网络或 npm 配置。
pause
exit /b 1
