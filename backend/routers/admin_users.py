from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import supabase
from models import User, UserRole, UserStatus, UserUpdate, UserCreateInternal
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
    user_data: UserCreateInternal,
    current_user: dict = Depends(require_admin)
):
    """
    管理员手动下发内部账号 (如 Kitchen, Driver)
    通过 Supabase Auth Admin API 直接创建账号，跳过邮件验证
    """
    try:
        # 1. 在 Supabase Auth 中创建账号
        auth_response = supabase.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True,
            "user_metadata": {
                "role": user_data.role.value,
                "name": user_data.name
            }
        })
        
        if not auth_response.user:
            raise Exception("Failed to create auth user")

        # 2. 同步到业务表 users (采用弹性字段插入)
        db_data = {
            "id": auth_response.user.id,
            "email": user_data.email,
            "role": user_data.role.value,
            "name": user_data.name
        }
        
        # 尝试添加可选字段，如果数据库报错则忽略
        try:
            temp_db_data = db_data.copy()
            temp_db_data["status"] = UserStatus.ACTIVE.value
            temp_db_data["employee_id"] = user_data.employee_id
            response = supabase.table("users").insert(temp_db_data).execute()
        except Exception as db_err:
            logger.warning(f"Failed to insert with extended fields, falling back to basic: {db_err}")
            # 回退到最简基础字段插入
            response = supabase.table("users").insert(db_data).execute()
        
        # 3. 记录审计日志 (如果审计表不存在也会跳过)
        try:
            supabase.table("audit_logs").insert({
                "actor_id": current_user.get("id"),
                "actor_role": current_user.get("role"),
                "action": "create_internal_user",
                "target": user_data.email,
                "detail": {
                    "role": user_data.role.value, 
                    "employee_id": user_data.employee_id,
                    "auth_id": auth_response.user.id
                }
            }).execute()
        except Exception:
            logger.warning("Failed to record audit log, likely table missing.")
        
        return response.data[0]
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        # 如果是邮箱已存在
        if "already registered" in str(e).lower():
             raise HTTPException(status_code=400, detail="User with this email already exists.")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")


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
