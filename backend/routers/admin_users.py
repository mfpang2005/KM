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
        auth_attributes = {
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True,
            "user_metadata": {
                "role": user_data.role.value,
                "name": user_data.name
            }
        }
        
        # 如果提供了电话且不为空，同步到 Auth
        if user_data.phone and user_data.phone.strip():
            auth_attributes["phone"] = user_data.phone.strip()
            auth_attributes["phone_confirm"] = True

        # 调用 Supabase Admin API
        auth_res = supabase.auth.admin.create_user(auth_attributes)
        
        # 兼容性处理：检查错误 (不同版本的 supabase-py 处理方式不同)
        error = getattr(auth_res, "error", None)
        if error:
            error_msg = getattr(error, "message", str(error))
            raise Exception(f"Auth Admin Error: {error_msg}")
            
        user = getattr(auth_res, "user", None)
        if not user:
            # 如果是字典格式则尝试从 dict 获取
            if isinstance(auth_res, dict) and "user" in auth_res:
                user_obj = auth_res["user"]
                user_id = user_obj.get("id") if isinstance(user_obj, dict) else getattr(user_obj, "id", None)
            else:
                raise Exception(f"Failed to create auth user: No user returned. Response type: {type(auth_res)}")
        else:
            user_id = user.id

        if not user_id:
            raise Exception("Failed to retrieve User ID from Auth response")

        # 2. 同步到业务表 users
        db_data = {
            "id": user_id,
            "email": user_data.email,
            "role": user_data.role.value,
            "name": user_data.name,
            "phone": user_data.phone
        }
        
        # 尝试插入 (包含可选字段，如果表结构不支持则回退)
        try:
            full_data = {
                **db_data,
                "status": UserStatus.ACTIVE.value,
                "is_disabled": False,
                "employee_id": user_data.employee_id
            }
            # 过滤掉值为 None 的字段以增加兼容性
            insert_data = {k: v for k, v in full_data.items() if v is not None}
            response = supabase.table("users").insert(insert_data).execute()
        except Exception as db_err:
            logger.warning(f"Failed full insert, falling back to basic: {db_err}")
            # 仅保留核心字段
            basic_data = {k: v for k, v in db_data.items() if v is not None}
            response = supabase.table("users").insert(basic_data).execute()
        
        if not response.data:
             logger.warning("DB Insert succeeded but returned no data.")
             return {**db_data, "id": user_id}
             
        return response.data[0]

    except Exception as e:
        logger.error(f"Critical error in create_internal_user: {str(e)}", exc_info=True)
        # 尝试抓取具体的 400 提示（如邮件已存在）
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
             raise HTTPException(status_code=400, detail="User with this email already exists.")
             
        raise HTTPException(status_code=500, detail=f"Creation failed: {str(e)}")


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
