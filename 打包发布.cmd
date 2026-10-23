@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call npm run build:exe
if errorlevel 1 goto failed
echo 安装包已生成到 desktop\dist。
pause
exit /b 0
:failed
echo 打包失败，请查看上方错误信息。
pause
exit /b 1
