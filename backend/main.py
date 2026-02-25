from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import orders, products, users
from routers import super_admin

app = FastAPI(title="Kim Long Smart Catering System API")

# NOTE: 配置 CORS，允许前端开发服务器的所有可能端口
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router)
app.include_router(products.router)
app.include_router(users.router)
app.include_router(super_admin.router)


@app.get("/")
async def root():
    return {"message": "Welcome to Kim Long Smart Catering System API"}
