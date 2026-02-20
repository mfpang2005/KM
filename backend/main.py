from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import orders, products, users

app = FastAPI(title="Kim Long Smart Catering System API")

# Configure CORS
origins = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
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

@app.get("/")
async def root():
    return {"message": "Welcome to Kim Long Smart Catering System API"}
