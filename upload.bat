@echo off
:: 使用绝对路径指向 Git，即使没有环境变量也能运行
set GIT_PATH="C:\Program Files\Git\cmd\git.exe"

if not exist %GIT_PATH% (
    echo [错误] 找不到 Git 程序，请确认 Git 已安装。
    echo 预设路径: %GIT_PATH%
    pause
    exit /b
)

echo [1/4] 正在初始化 Git 仓库...
if not exist .git (
    %GIT_PATH% init
)

echo [2/4] 正在添加文件并提交...
%GIT_PATH% add .
%GIT_PATH% commit -m "Initialize project with order linkage and social login"

echo [3/4] 正在配置远程仓库 (HTTPS)...
%GIT_PATH% remote remove origin >nul 2>&1
%GIT_PATH% remote add origin git@github.com:mfpang2005/KM.git

echo [4/4] 正在上载到 GitHub...
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
