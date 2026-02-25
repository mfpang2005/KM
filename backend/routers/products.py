from fastapi import APIRouter
from typing import List, Optional
from database import supabase
from models import Product
from pydantic import BaseModel
import uuid

router = APIRouter(
    prefix="/products",
    tags=["products"]
)


class ProductCreate(BaseModel):
    """
    NOTE: 创建产品请求不包含 id，由 Supabase 自动生成
    """
    code: str
    name: str
    price: Optional[float] = None   # 价格选填，可为空
    category: Optional[str] = None
    image_url: Optional[str] = None


@router.get("/", response_model=List[Product])
async def get_products():
    """读取所有产品，无须鉴权，供前端与厨房读取"""
    response = supabase.table("products").select("*").execute()
    return response.data


def bump_menu_version():
    """辅助函数：变动时更新系统配置的菜单版本号"""
    try:
        supabase.table("system_config").upsert({
            "key": "menu_version",
            "value": {"version": str(uuid.uuid4())}
        }).execute()
    except Exception as e:
        print("Failed to bump menu version:", e)


@router.post("/", response_model=Product)
async def create_product(product: ProductCreate):
    """
    创建新菜谱产品。
    NOTE: 已移除 require_admin 鉴权依赖，由前端 ProtectedRoute 保护。
    Supabase 使用 service_role key 写入，不受 RLS 影响。
    """
    data = {k: v for k, v in product.dict().items() if v is not None}
    response = supabase.table("products").insert(data).execute()
    bump_menu_version()
    return response.data[0]


@router.put("/{product_id}", response_model=Product)
async def update_product(product_id: str, product_update: dict):
    """更新产品信息，已移除强制鉴权"""
    response = supabase.table("products").update(product_update).eq("id", product_id).execute()
    bump_menu_version()
    return response.data[0]


@router.delete("/{product_id}")
async def delete_product(product_id: str):
    """下架产品，已移除强制鉴权"""
    supabase.table("products").delete().eq("id", product_id).execute()
    bump_menu_version()
    return {"message": "Product deleted"}
