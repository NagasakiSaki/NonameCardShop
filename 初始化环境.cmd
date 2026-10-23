@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call npm ci
if errorlevel 1 goto failed
call npm run setup
if errorlevel 1 goto failed
echo 环境初始化完成。双击“开发启动”或“桌面开发”。
pause
exit /b 0
:failed
echo 初始化失败，请查看上方错误信息。
pause
exit /b 1
