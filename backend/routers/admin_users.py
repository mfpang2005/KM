from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import supabase
from models import User, UserRole, UserStatus, UserUpdate
from middleware.auth import require_admin
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(require_admin)]
)

@router.post("/", response_model=User)
async def create_internal_user(
    email: str,
    role: UserRole,
    name: str = None,
    current_user: dict = Depends(require_admin)
):
    """
    管理员手动下发内部账号 (如 Kitchen, Driver)
    将直接注册并默认为 ACTIVE 状态
    注意：在实际环境中这里应该调用 supabase.auth.admin.create_user 发配密码
    """
    try:
        data = {
            "email": email,
            "role": role.value,
            "name": name,
            "status": UserStatus.ACTIVE.value
        }
        # 由于我们尚未完全接入后端发信Auth，我们只写业务表
        response = supabase.table("users").insert(data).execute()
        
        # 记录审计日志
        supabase.table("audit_logs").insert({
            "actor_id": current_user.get("id"),
            "actor_role": current_user.get("role"),
            "action": "create_internal_user",
            "target": email,
            "detail": {"role": role.value, "status": UserStatus.ACTIVE.value}
        }).execute()
        
        return response.data[0]
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user account")


@router.patch("/{user_id}/status", response_model=User)
async def update_user_status(
    user_id: str,
    status: UserStatus,
    current_user: dict = Depends(require_admin)
):
    """
    工作流：审批外部账号 (PENDING -> ACTIVE) 
    或软删除账号 (-> DELETED) 
    或封停账号 (-> DELETED/PENDING)
    """
    # 不能封停自己
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot alter your own status")
    
    response = supabase.table("users").update({"status": status.value}).eq("id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 记录审计日志
    supabase.table("audit_logs").insert({
        "actor_id": current_user.get("id"),
        "actor_role": current_user.get("role"),
        "action": f"change_user_status_to_{status.value}",
        "target": user_id
    }).execute()
    
    return response.data[0]
