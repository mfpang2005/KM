@echo off
set GIT_PATH="C:\Program Files\Git\cmd\git.exe"

if not exist %GIT_PATH% (
    echo [错误] 找不到 Git 程序，请确认 Git 已安装。
    echo 预设路径: %GIT_PATH%
    pause
    exit /b
)

echo [1/3] 正在添加文件并提交...
%GIT_PATH% add .
%GIT_PATH% commit -m "feat: Add Global Dispatch Walkie-Talkie to Kitchen and Fleet Center"

echo [2/3] 正在配置远程仓库 (HTTPS)...
%GIT_PATH% remote remove origin >nul 2>&1
%GIT_PATH% remote add origin https://github.com/mfpang2005/KM.git

echo [3/3] 正在上载到 GitHub...
%GIT_PATH% branch -M main
%GIT_PATH% push -u origin main

if %ERRORLEVEL% neq 0 (
    echo.
    echo [上载失败] 
    echo 1. 请确认您已经登录 GitHub 账号。
    echo 2. 可能需要输入 GitHub 的 Access Token。
) else (
    echo.
    echo [恭喜] 项目已成功上载到 GitHub!
)

pause
