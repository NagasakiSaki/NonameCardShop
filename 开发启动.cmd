@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo 启动浏览器开发版，关闭窗口或按 Ctrl+C 停止。
call npm run dev:open
if errorlevel 1 pause
