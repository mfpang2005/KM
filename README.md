# Kim-Long-CRM

Smart Catering Management System for Kim Long.

## Features
- **Order Management**: Real-time order tracking and status updates across Admin, Kitchen, and Driver views.
- **Departmental Linkage**: Automated workflow from order creation to delivery completion.
- **Social Login**: Integrated Google and Facebook authentication via Supabase.
- **Maps Integration**: One-click navigation for drivers and location checking for admins.

## Tech Stack
- Frontend: React + TypeScript + Vite
- Backend: FastAPI (Python)
- Database/Auth: Supabase

## 本地开发管理 (Local Development)

为了解决本地环境频繁不可用的问题，现在提供了三套工具脚本：

1. **一键启动 (`start-all.bat`)**: 同时启动后端 (8000)、主前端 (3000) 和管理端 (5174)。
2. **一键停止 (`stop-all.bat`)**: 彻底杀掉占用上述端口的进程，解决“端口被占用”问题。
3. **健康检查 (`python check-services.py`)**: 快速验证三个服务是否都在正常运行。

### 推荐开发流程：
- **首次运行**：确保已安装依赖 (`npm install` & `pip install -r backend/requirements.txt`)。
- **日常启动**：双击运行 `start-all.bat`。
- **环境异常/端口占用**：先运行 `stop-all.bat` 清理环境，然后再运行 `start-all.bat`。
- **验证状态**：在终端运行 `python check-services.py`。
