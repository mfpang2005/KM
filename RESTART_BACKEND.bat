@echo off
TITLE Kim Long - Restart Backend (FastAPI)
SETLOCAL

:: 设置路径
SET "BASE_DIR=%~dp0"
SET "BACKEND_DIR=%BASE_DIR%backend"
SET "PYTHON_EXE=%BASE_DIR%.venv\Scripts\python.exe"

echo ==========================================
echo   RESTARTING: FastAPI Backend (Port 8000)
echo ==========================================

:: 1. 清理端口 8000
echo [1/2] Checking port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Finishing process PID: %%a...
    taskkill /F /PID %%a 2>NUL
)

:: 2. 启动后端
echo [2/2] Launching Backend...
if exist "%PYTHON_EXE%" (
    start "BACKEND_SERVICE" cmd /k "cd /d %BACKEND_DIR% && echo Starting FastAPI... && "%PYTHON_EXE%" -m uvicorn main:app --reload --port 8000 --host 0.0.0.0"
) else (
    echo [ERROR] Virtual environment not found at %PYTHON_EXE%
    pause
    exit
)

echo.
echo ==========================================
echo   FastAPI Restarted! Port: 8000
echo ==========================================
