@echo off
TITLE Kim Long Services - STABLE MODE
SET BASE_DIR=%~dp0
SET ADMIN_DIR=%BASE_DIR%admin-web
SET BACKEND_DIR=%BASE_DIR%backend

echo [1/3] Starting Backend on 0.0.0.0:8000...
start "Backend" cmd /k "cd /d %BACKEND_DIR% && ..\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo [2/3] Starting Admin Web on 5174...
start "Admin Web" cmd /k "cd /d %ADMIN_DIR% && npm.cmd run dev"

echo [3/3] Starting Main Frontend on 3000...
start "Main Frontend" cmd /k "cd /d %BASE_DIR% && npm.cmd run dev"

echo.
echo =====================================================
echo All services started. 
echo - Admin Web: http://localhost:5174
echo - Main Frontend: http://localhost:3000
echo =====================================================
pause
