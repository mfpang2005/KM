from fastapi import APIRouter
from typing import List
from database import supabase
from models import Product

router = APIRouter(
    prefix="/products",
    tags=["products"]
)

@router.get("/", response_model=List[Product])
async def get_products():
    response = supabase.table("products").select("*").execute()
    return response.data

@router.post("/", response_model=Product)
async def create_product(product: Product):
    response = supabase.table("products").insert(product.dict()).execute()
    return response.data[0]
