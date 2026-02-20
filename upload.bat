@echo off
set GIT_PATH="C:\Program Files\Git\cmd\git.exe"

if not exist %GIT_PATH% (
    echo Git executable not found at %GIT_PATH%. Please ensure Git is installed.
    pause
    exit /b
)

echo Initializing Git...
%GIT_PATH% init
%GIT_PATH% add .
%GIT_PATH% commit -m "Initialize project with order linkage and social login"

echo Configuring remote...
%GIT_PATH% remote remove origin >nul 2>&1
%GIT_PATH% remote add origin git@github.com:mfpang2005/Kim-Long-CRM.git

echo.
echo Attempting to push to GitHub (SSH)...
%GIT_PATH% branch -M main
%GIT_PATH% push -u origin main

if %ERRORLEVEL% neq 0 (
    echo.
    echo Pushing failed. If this is a permission error, make sure your SSH keys are configured in GitHub.
    echo You can also try changing the remote URL to HTTPS in this script.
)

pause
