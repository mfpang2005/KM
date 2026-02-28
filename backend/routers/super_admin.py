"""
Super Admin 路由模块
提供超级管理员专属的 API 端点：用户管理、系统配置、审计日志、统计总览
所有路由均受 require_super_admin 权限守卫保护
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from database import supabase
from models import (
    UserRole, UserUpdate, SystemConfig, SystemConfigUpdate,
    AuditLog, StatsOverview, Order, User,
)
from middleware.auth import require_super_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/super-admin",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)],
)


# ── 辅助函数：记录审计日志 ──

async def _log_audit(actor: dict, action: str, target: str, detail: Optional[dict] = None) -> None:
    """
    将 Super Admin 的操作写入审计日志表
    """
    try:
        supabase.table("audit_logs").insert({
            "actor_id": actor.get("id"),
            "actor_role": actor.get("role"),
            "action": action,
            "target": target,
            "detail": detail or {},
        }).execute()
    except Exception as e:
        # NOTE: 审计日志写入失败不应阻断主流程
        logger.error("Failed to write audit log: %s", str(e))


# ═══════════════════════════════════════════
# 1. 统计总览
# ═══════════════════════════════════════════

@router.get("/stats", response_model=StatsOverview)
async def get_stats_overview(
    current_user: dict = Depends(require_super_admin),
):
    """
    获取全局统计数据：订单总数、总营收、用户总数、各状态订单占比
    """
    # 拉取所有订单
    orders_resp = supabase.table("orders").select("*").execute()
    orders = orders_resp.data or []

    # 拉取所有用户
    users_resp = supabase.table("users").select("id").execute()
    users = users_resp.data or []

    # 按状态分组统计
    status_counts: dict[str, int] = {}
    total_revenue = 0.0
    for order in orders:
        status = order.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        total_revenue += float(order.get("amount", 0))

    # 最近 5 条订单
    recent = sorted(orders, key=lambda o: o.get("created_at", ""), reverse=True)[:5]

    return StatsOverview(
        total_orders=len(orders),
        total_revenue=total_revenue,
        total_users=len(users),
        orders_by_status=status_counts,
        recent_orders=recent,
    )


# ═══════════════════════════════════════════
# 2. 用户管理
# ═══════════════════════════════════════════

@router.get("/users")
async def list_all_users(
    current_user: dict = Depends(require_super_admin),
):
    """
    获取所有用户列表
    """
    response = supabase.table("users").select("*").execute()
    return response.data or []


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    update: UserUpdate,
    current_user: dict = Depends(require_super_admin),
):
    """
    修改用户角色或禁用状态
    """
    # 构建更新数据，只包含非 None 字段
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # NOTE: 如果 role 是枚举类型，需要转换为字符串值
    if "role" in update_data:
        update_data["role"] = update_data["role"].value if hasattr(update_data["role"], "value") else update_data["role"]

    response = supabase.table("users").update(update_data).eq("id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")

    # 记录审计日志
    await _log_audit(
        actor=current_user,
        action="update_user",
        target=user_id,
        detail=update_data,
    )

    return response.data[0]


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_super_admin),
):
    """
    删除用户账号
    """
    # 防止删除自身
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    response = supabase.table("users").delete().eq("id", user_id).execute()

    await _log_audit(
        actor=current_user,
        action="delete_user",
        target=user_id,
    )

    return {"message": "User deleted successfully"}


# ═══════════════════════════════════════════
# 3. 系统配置
# ═══════════════════════════════════════════

@router.get("/config")
async def get_all_config(
    current_user: dict = Depends(require_super_admin),
):
    """
    读取所有系统配置项
    """
    response = supabase.table("system_config").select("*").execute()
    return response.data or []


@router.put("/config/{key}")
async def upsert_config(
    key: str,
    config: SystemConfigUpdate,
    current_user: dict = Depends(require_super_admin),
):
    """
    创建或更新单个系统配置项（upsert 语义）
    """
    data = {
        "key": key,
        "value": config.value,
        "updated_by": current_user.get("id"),
    }
    response = supabase.table("system_config").upsert(data).execute()

    await _log_audit(
        actor=current_user,
        action="update_config",
        target=key,
        detail=config.value,
    )

    if response.data:
        return response.data[0]
    return data


# ═══════════════════════════════════════════
# 4. 审计日志
# ═══════════════════════════════════════════

@router.get("/audit-logs")
async def get_audit_logs(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    current_user: dict = Depends(require_super_admin),
):
    """
    分页查询审计日志，按时间倒序
    """
    offset = (page - 1) * page_size

    response = (
        supabase.table("audit_logs")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
    )

    # 获取总数用于分页
    count_resp = supabase.table("audit_logs").select("id", count="exact").execute()
    total = count_resp.count if hasattr(count_resp, "count") and count_resp.count else 0

    return {
        "data": response.data or [],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


# ═══════════════════════════════════════════
# 5. 全局订单监控与审批
# ═══════════════════════════════════════════

@router.get("/orders")
async def get_all_orders(
    status: Optional[str] = Query(None, description="订单状态筛选"),
    current_user: dict = Depends(require_super_admin),
):
    """
    获取全局订单列表，支持按状态筛选
    """
    query = supabase.table("orders").select("*").order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
        
    response = query.execute()
    return response.data or []


@router.patch("/orders/{order_id:path}/approve")
async def approve_order(
    order_id: str,
    current_user: dict = Depends(require_super_admin),
):
    """
    审批订单：将状态从 pending 修改为 preparing
    """
    # 验证订单当前状态
    order_resp = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not order_resp.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order = order_resp.data[0]
    if order.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot approve order in {order.get('status')} status")
        
    # 更新状态为 preparing
    update_data = {"status": "preparing"}
    response = supabase.table("orders").update(update_data).eq("id", order_id).execute()
    
    # 记录审计日志
    await _log_audit(
        actor=current_user,
        action="approve_order",
        target=order_id,
        detail={"old_status": "pending", "new_status": "preparing"},
    )
    
    return response.data[0]
