from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import re
from contextlib import asynccontextmanager
from routers import super_admin, admin_users, recipes, orders, products, users, vehicles, customers, audio
from services.goeasy import close_client

# ── 资源生命周期管理 ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时逻辑
    logger.info("Initializing Kim Long API services...")
    yield
    # 关闭时逻辑
    logger.info("Closing API services connections...")
    await close_client()

# ── 配置日志 ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ── 应用初始化 ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Kim Long Smart Catering System API",
    lifespan=lifespan
)

# ── 配置 CORS ──────────────────────────────────────────────────────────────
# 允许前端开发服务器的所有可能端口 (静态列表 + 正则表达式)
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]

# 允许本地局域网和 127.0.0.1 的所有 3000-3005, 5173-5180 端口
allow_origin_regex = r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):(300\d|51\d\d)"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 注册路由 ──────────────────────────────────────────────────────────────
app.include_router(orders.router)
app.include_router(recipes.router)
app.include_router(products.router)
app.include_router(users.router)
app.include_router(admin_users.router)
app.include_router(super_admin.router)
app.include_router(vehicles.router)
app.include_router(customers.router)
app.include_router(audio.router)


# ── 基础接口 ──────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Kim Long Smart Catering System API"}

@app.get("/health")
async def health():
    """
    健康检查接口：返回系统时间，用于前端同步
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0"
    }
