@echo off
TITLE Kim Long Smart Catering - Robust Start All
SETLOCAL

:: 设置基础路径
SET BASE_DIR=%~dp0
SET BACKEND_DIR=%BASE_DIR%backend
SET ADMIN_DIR=%BASE_DIR%admin-web
SET PYTHON_EXE=%BASE_DIR%.venv\Scripts\python.exe

echo ==========================================
echo   Kim Long Smart Catering - 一键修复启动
echo ==========================================

:: 1. 启动后端 (Port 8000)
echo [1/3] 正在启动后端服务 (FastAPI)...
start "Backend (8000)" cmd /c "cd /d %BACKEND_DIR% && %PYTHON_EXE% -m uvicorn main:app --reload --port 8000"

:: 2. 启动主前端 (Port 3000)
echo [2/3] 正在启动主前端服务 (Vite)...
:: 使用 cmd /c 显式调用 npm.cmd 以绕过 PowerShell 策略限制
start "Main Frontend (3000)" cmd /c "cd /d %BASE_DIR% && cmd /c npm run dev"

:: 3. 启动管理端前端 (Port 5174)
echo [3/3] 正在启动管理端前端服务 (Vite)...
start "Admin Web (5174)" cmd /c "cd /d %ADMIN_DIR% && cmd /c npm run dev"

echo.
echo ==========================================
echo   所有服务启动指令已发出！
echo   请检查打开的三个窗口确认运行状态。
echo   如果窗口瞬间关闭，请检查是否已安装依赖。
echo ==========================================
pause
