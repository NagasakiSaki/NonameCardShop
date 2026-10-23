@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call npm test
if errorlevel 1 goto failed
echo 全部测试通过，报告在 test-results 文件夹。
pause
exit /b 0
:failed
echo 测试失败，请查看 test-results 中本次运行的日志。
pause
exit /b 1
