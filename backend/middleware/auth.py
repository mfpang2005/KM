"""
认证与权限守卫中间件
通过 Supabase JWT 验证用户身份，并提供基于角色的访问控制
"""
import os
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Header
from database import supabase
from models import UserRole

logger = logging.getLogger(__name__)


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None)
) -> dict:
    """
    从 Authorization 请求头中解析 Supabase JWT Token，
    返回当前用户的 id 和 role。

    NOTE: 同时支持两种认证方式：
    1. Supabase Auth JWT（标准方式）
    2. 简易 Header 方式 —— 传递 x-user-id + x-user-role（开发/测试用）
    """
    # 方式 2: 简易 Header (优先处理，方便测试覆盖)
    if x_user_id and x_user_role:
        return {"id": x_user_id, "role": x_user_role}

    # 方式 1: 标准 Supabase JWT
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        try:
            from fastapi.concurrency import run_in_threadpool
            # NOTE: 使用 run_in_threadpool 避免同步调用阻塞 FastAPI 事件循环
            user_response = await run_in_threadpool(supabase.auth.get_user, token)
            if not user_response or not user_response.user:
                raise HTTPException(status_code=401, detail="Invalid or expired token")

            user_id = str(user_response.user.id)
            user_metadata = user_response.user.user_metadata or {}
            
            # 优先从 metadata 获取角色 (这是 Auth 服务器签发的权威信息)
            # 只有当需要业务表特有属性时才查询 DB
            role = user_metadata.get("role", "user")
            
            # 可选：尝试从数据库同步/验证，但不应因为 DB 缺失而导致 401/403 (对于刚创建的 Admin)
            try:
                db_response = await run_in_threadpool(
                    supabase.table("users").select("role").eq("id", user_id).single().execute
                )
                if db_response.data and db_response.data.get("role"):
                    role = db_response.data.get("role")
            except Exception as e:
                logger.debug("DB role fetch skipped or failed for %s: %s", user_id, str(e))

            return {"id": user_id, "role": role}
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Token verification failed: %s", str(e))
            raise HTTPException(status_code=401, detail="Token verification failed")

    raise HTTPException(
        status_code=401,
        detail="Missing or invalid Authorization header. Expected: Bearer <token>"
    )


async def require_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    权限守卫：允许 admin 或 super_admin 访问。（适用于常规后台操作）
    """
    if current_user.get("role") not in [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]:
        logger.warning(
            "Unauthorized admin access attempt by user %s (role: %s)",
            current_user.get("id"),
            current_user.get("role"),
        )
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Admin access required."
        )
    return current_user


async def require_super_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    权限守卫：仅允许 super_admin 角色访问。（适用于最高层级敏感提权控制）
    作为 FastAPI 路由的依赖项注入使用。
    """
    if current_user.get("role") != UserRole.SUPER_ADMIN.value:
        logger.warning(
            "Unauthorized super_admin access attempt by user %s (role: %s)",
            current_user.get("id"),
            current_user.get("role"),
        )
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Super Admin access required."
        )
    return current_user
