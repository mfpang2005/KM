@echo off
TITLE Kim Long - Deep Backend Repair & Restart
SETLOCAL

:: 设置路径
SET "BASE_DIR=%~dp0"
SET "BACKEND_DIR=%BASE_DIR%backend"
SET "PYTHON_EXE=%BASE_DIR%.venv\Scripts\python.exe"
SET "PIP_EXE=%BASE_DIR%.venv\Scripts\pip.exe"

echo ==========================================
echo   DEEP REPAIR: FastAPI Backend
echo ==========================================

:: 1. 杀死残留进程
echo [1/4] Cleaning existing processes (Ports: 8000, 5174)...
for %%P in (8000 5174) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P ^| findstr LISTENING') do (
        echo Cleanup PID %%a on port %%P...
        taskkill /F /PID %%a 2>NUL
    )
)
:: Backup cleanup for node/python processes
taskkill /F /IM node.exe /T 2>NUL
taskkill /F /IM python.exe /T 2>NUL

:: 2. 尝试修复并更新依赖
echo [2/4] Verifying/Installing Backend Dependencies...
if exist "%PYTHON_EXE%" (
    cd /d "%BACKEND_DIR%"
    "%PYTHON_EXE%" -m pip install --upgrade pip
    "%PYTHON_EXE%" -m pip install -r requirements.txt
) else (
    echo [ERROR] Virtual environment not found at %PYTHON_EXE%
    pause
    exit
)

:: 3. 修复执行限制
echo [3/4] Resetting PowerShell Policy...
powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force" 2>NUL

:: 4. 启动后端 (带自动重试日志)
echo [4/4] Launching Backend...
start "BACKEND_SERVICE" cmd /k "cd /d %BACKEND_DIR% && echo Starting FastAPI... && "%PYTHON_EXE%" -m uvicorn main:app --reload --port 8000 --host 0.0.0.0"

:: 5. 顺便启动管理端
echo Launching Admin Panel...
start "ADMIN_PANEL" cmd /k "cd /d %BASE_DIR%admin-web && npm.cmd run dev"

echo.
echo ==========================================
echo   Repair complete! 
echo   Please check the BACKEND_SERVICE window.
echo   If it says 'Application startup complete',
echo   you can access http://localhost:5174
echo ==========================================
pause
