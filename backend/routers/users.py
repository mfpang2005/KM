from fastapi import APIRouter, HTTPException
from typing import List
from database import supabase
from models import User, UserRole
from fastapi.concurrency import run_in_threadpool

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/", response_model=List[User])
async def get_users():
    response = await run_in_threadpool(supabase.table("users").select("*").execute)
    return response.data

@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str):
    response = await run_in_threadpool(supabase.table("users").select("*").eq("id", user_id).execute)
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
    return response.data[0]

# Simple login simulation by checking email/role exists
@router.post("/login")
async def login(email: str, role: UserRole):
    # In a real app, use Supabase Auth (GoTrue).
    # Here we just check if a user with this email and role exists in our 'users' table
    response = await run_in_threadpool(
        supabase.table("users").select("*").eq("email", email).eq("role", role).execute
    )
    if not response.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return response.data[0]


@router.get("/me/profile", response_model=User)
async def get_current_user_profile(user_id: str):
    """
    获取当前用户资料 (根据 ID)，模拟真实环境中的 /me
    前端在拿到 session 里的 uid 后传过来查
    """
    response = await run_in_threadpool(supabase.table("users").select("*").eq("id", user_id).execute)
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
    return response.data[0]


from services.audit import record_audit, AuditActions

@router.patch("/me/profile", response_model=User)
async def update_current_user_profile(user_id: str, profile_data: dict):
    """
    允许用户更新自己的名字、电话、头像和车辆状态
    """
    allowed_fields = {"name", "phone", "avatar_url", "vehicle_model", "vehicle_plate", "vehicle_type", "vehicle_status"}
    update_data = {k: v for k, v in profile_data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
        
    response = await run_in_threadpool(supabase.table("users").update(update_data).eq("id", user_id).execute)
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Record Audit (Self update)
    await record_audit(
        actor_id=user_id,
        actor_role="self",  # 或者从上下文获取更精确的角色
        action=AuditActions.USER_PROFILE_UPDATE,
        target=user_id,
        detail=update_data
    )
        
    return response.data[0]
