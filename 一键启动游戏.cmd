@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "SHOP_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "SHOP_NODE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo 未找到 Node.js，请先安装 Node.js 22.12 或更新版本。
    pause
    exit /b 1
  )
)
echo 正在打开无名小店最新版……
"%SHOP_NODE%" dev\start-game.mjs %*
set "SHOP_EXIT=%ERRORLEVEL%"
if not "%SHOP_EXIT%"=="0" pause
exit /b %SHOP_EXIT%
