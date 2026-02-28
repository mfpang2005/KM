@echo off
TITLE Kim Long Smart Catering - Stop All Services
SETLOCAL

echo ==========================================
echo   Kim Long Smart Catering - 一键停止脚本
echo ==========================================

:: 定义需要清理的端口
SET PORTS=8000 3000 5174

echo 正在清理端口占用...

for %%P in (%PORTS%) do (
    echo 正在检查端口 %%P...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P ^| findstr LISTENING') do (
        echo 发现进程 PID: %%a 占用端口 %%P，正在终止...
        taskkill /F /PID %%a
    )
)

:: 额外清理可能残留的 node 和 python 进程（可选，但更彻底）
:: echo 正在清理可能的残留进程...
:: taskkill /F /IM node.exe /T 2>NUL
:: taskkill /F /IM python.exe /T 2>NUL

echo.
echo ==========================================
echo   所有相关端口已清理完成！
echo ==========================================
pause
