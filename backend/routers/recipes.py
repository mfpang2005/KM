from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import supabase
from models import Recipe
import uuid

router = APIRouter(
    prefix="/recipes",
    tags=["recipes"]
)

@router.get("", response_model=List[Recipe])
async def get_recipes():
    """读取所有菜谱"""
    response = supabase.table("recipes").select("*").order("name", desc=False).execute()
    return response.data or []

@router.post("", response_model=Recipe)
async def create_recipe(recipe: Recipe):
    """创建新菜谱"""
    data = recipe.model_dump(exclude_none=True)
    if "id" in data:
        del data["id"]
    
    # 转换为 JSONB 存储格式
    data["ingredients"] = [ing.model_dump() for ing in recipe.ingredients]
    
    response = supabase.table("recipes").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Could not create recipe")
    return response.data[0]

@router.put("/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, recipe: Recipe):
    """更新现有菜谱"""
    data = recipe.model_dump(exclude_none=True)
    if "id" in data:
        del data["id"]
        
    data["ingredients"] = [ing.model_dump() for ing in recipe.ingredients]
    data["updated_at"] = "now()" # 让 Postgres 处理时间戳
    
    response = supabase.table("recipes").update(data).eq("id", recipe_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]

@router.delete("/{recipe_id}")
async def delete_recipe(recipe_id: str):
    """删除菜谱"""
    response = supabase.table("recipes").delete().eq("id", recipe_id).execute()
    return {"message": "Recipe deleted successfully"}
