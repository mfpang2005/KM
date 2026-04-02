from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.concurrency import run_in_threadpool
from typing import List
from database import supabase
from models import User, UserRole, UserStatus, UserUpdate, UserCreateInternal
from middleware.auth import require_admin
from services.audit import record_audit, AuditActions
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
        logger.info(f"Starting internal user creation for email: {user_data.email}")
        
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
        
        try:
            logger.info("Attempting Supabase Auth Admin creation...")
            auth_res = await run_in_threadpool(supabase.auth.admin.create_user, auth_attributes)
            logger.info(f"Auth Response Type: {type(auth_res)}")
        except Exception as auth_err:
            logger.error(f"Supabase Auth Admin call failed: {auth_err}")
            raise Exception(f"Auth Step Failed: {auth_err}")
        
        # 兼容性处理：不同版本的 supabase-py 有不同的返回结构 (UserResponse vs dict)
        user_id = None
        
        # 1. 检查属性 (UserResponse 模式)
        user_obj = getattr(auth_res, "user", None)
        if user_obj:
            user_id = getattr(user_obj, "id", None)
            logger.info(f"Found User ID via attribute: {user_id}")
        
        # 2. 如果没有属性，尝试字典解析 (dict 模式)
        if not user_id and isinstance(auth_res, dict):
            user_dict = auth_res.get("user")
            if user_dict:
                user_id = user_dict.get("id") if isinstance(user_dict, dict) else getattr(user_dict, "id", None)
                logger.info(f"Found User ID via dict: {user_id}")
        
        # 3. 检查是否有错误属性
        error = getattr(auth_res, "error", None)
        if error and not user_id:
            error_msg = getattr(error, "message", str(error))
            logger.error(f"Auth returned error: {error_msg}")
            raise Exception(f"Auth Admin Error: {error_msg}")

        if not user_id:
            logger.error(f"User ID still missing. Full Response: {auth_res}")
            raise Exception(f"Failed to retrieve User ID. Response: {auth_res}")

        # 2. 同步到业务表 users
        # NOTE: 仅同步 [id, email, role, name, phone]，其余字段如 status, is_disabled 不存在
        db_data = {
            "id": user_id,
            "email": user_data.email,
            "role": user_data.role.value,
            "name": user_data.name,
            "phone": user_data.phone
        }
        
        # 过滤掉 None 值并插入
        insert_data = {k: v for k, v in db_data.items() if v is not None}
        logger.info(f"Attempting DB Sync to 'users' table: {insert_data}")
        try:
            response = await run_in_threadpool(supabase.table("users").insert(insert_data).execute)
            logger.info(f"DB Insert Response: {response}")
        except Exception as db_sync_err:
            logger.error(f"DB Sync to 'users' table failed: {db_sync_err}")
            raise Exception(f"Database Sync Failed: {db_sync_err}")

        # 3. Audit Logging
        logger.info("Attempting to record audit log...")
        try:
            await record_audit(
                actor_id=current_user.get("id"),
                actor_role=current_user.get("role"),
                action=AuditActions.USER_CREATE_INTERNAL,
                target=user_id,
                detail={"email": user_data.email, "role": user_data.role.value}
            )
            logger.info("Audit log recorded successfully.")
        except Exception as audit_err:
            logger.warning(f"Audit logging failed (non-critical): {audit_err}")

        if not response.data:
             logger.warning("DB Insert succeeded but returned no data.")
             return {**db_data, "id": user_id}
             
        logger.info("Internal user creation sequence completed successfully.")
        return response.data[0]

    except Exception as e:
        logger.error(f"CRITICAL TRACE: create_internal_user failed at phase: {str(e)}", exc_info=True)
        error_msg = str(e)
        
        # 处理常见的业务级错误，返回友好提示
        err_lower = error_msg.lower()
        if "already registered" in err_lower or "already exists" in err_lower or "user_already_exists" in err_lower:
             raise HTTPException(status_code=400, detail="该邮箱已被注册 (Email already registered).")
             
        raise HTTPException(status_code=500, detail=f"创建失败 (Creation failed): {error_msg}")


@router.patch("/{user_id}/status", response_model=User)
async def update_user_status(
    user_id: str,
    status: UserStatus = Query(...),
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
    
    response = await run_in_threadpool(
        supabase.table("users").update({"status": status.value}).eq("id", user_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 记录审计日志
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.USER_STATUS_CHANGE,
        target=user_id,
        detail={"status": status.value}
    )
    
    return response.data[0]
