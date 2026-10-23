@echo off
setlocal
cd /d "%~dp0"
echo Open http://127.0.0.1:5174 after the server starts.
node server.mjs
pause
