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
    from fastapi.concurrency import run_in_threadpool
    try:
        await run_in_threadpool(supabase.table("audit_logs").insert({
            "actor_id": actor.get("id"),
            "actor_role": actor.get("role"),
            "action": action,
            "target": target,
            "detail": detail or {},
        }).execute)
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
    from fastapi.concurrency import run_in_threadpool
    
    # 获取所有订单的状态和金额以计算总量
    all_orders_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("status, amount")
        .execute
    )
    all_orders_data = all_orders_resp.data or []
    
    total_orders = len(all_orders_data)
    total_revenue = sum(float(o.get("amount", 0)) for o in all_orders_data)
    
    status_counts: dict[str, int] = {}
    for o in all_orders_data:
        s = o.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1

    # 拉取最近 200 条完整订单用于业务逻辑 (如 Recent Activity 的子集等)
    recent_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("*")
        .order("created_at", desc=True)
        .limit(200)
        .execute
    )
    # 拉取用户总数
    users_resp = await run_in_threadpool(supabase.table("users").select("id", count="exact").execute)
    total_users = users_resp.count if hasattr(users_resp, "count") else len(users_resp.data or [])

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "total_users": total_users,
        "orders_by_status": status_counts
    }


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
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("users").select("*").execute)
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

    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("users").update(update_data).eq("id", user_id).execute)
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")

    # GoEasy Notification
    from services.goeasy import publish_message
    await publish_message({
        "type": "user_update",
        "userId": user_id,
        "detail": update_data
    })

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

    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("users").delete().eq("id", user_id).execute)

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
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("system_config").select("*").execute)
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
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(supabase.table("system_config").upsert(data).execute)

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

    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(
        supabase.table("audit_logs")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute
    )

    # 获取总数用于分页
    count_resp = await run_in_threadpool(supabase.table("audit_logs").select("id", count="exact").execute)
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
        
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(query.execute)
    return response.data or []


# ═══════════════════════════════════════════
# 7. 数据重置 (已废弃，建议直接操作数据库)
# ═══════════════════════════════════════════


@router.get("/financials")
async def get_financials(
    range: str = "today",
    payment_status: str = "all",
    current_user: dict = Depends(require_super_admin),
):
    """
    获取财务汇总数据，支持范围过滤与支付状态过滤。
    统一逻辑：使用 dueTime 作为交付日期过滤。
    """
    from fastapi.concurrency import run_in_threadpool
    from datetime import datetime, timezone
    import dateutil.parser

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # Fetch orders from a wider 60-day window to ensure all active orders are included in metrics.
    # This prevents missing orders created in previous months but due in the current month.
    window_start = (now - timedelta(days=60)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    query = supabase.table("orders").select("*").gte("created_at", window_start).neq("status", "cancelled")
    
    response = await run_in_threadpool(query.execute)
    all_orders = response.data or []

    period_revenue = 0
    today_revenue = 0
    today_order_count = 0
    pm_stats: dict = {}

    for o in all_orders:
        curr_amount = o.get("amount") or 0
        due_time_raw = o.get("dueTime") or ""
        p_status = o.get("paymentStatus") or "pending"
        
        # Parse dueTime
        is_today = False
        is_in_period = False
        try:
            if due_time_raw and "T" in due_time_raw:
                dt = dateutil.parser.isoparse(due_time_raw)
                dt_str = dt.strftime("%Y-%m-%d")
                if dt_str == today_str:
                    is_today = True
                
                if range == "today":
                    if dt_str == today_str: is_in_period = True
                elif range == "month":
                    if dt.month == now.month and dt.year == now.year: is_in_period = True
                else: # all
                    is_in_period = True
            else:
                # Fallback to created_at
                ca = dateutil.parser.isoparse(o.get("created_at"))
                ca_str = ca.strftime("%Y-%m-%d")
                if ca_str == today_str:
                    is_today = True
                
                if range == "today":
                    if ca_str == today_str: is_in_period = True
                elif range == "month":
                    if ca.month == now.month and ca.year == now.year: is_in_period = True
                else:
                    is_in_period = True
        except Exception:
            continue

        # Filter by payment_status parameter from request (if applicable)
        if payment_status == "paid" and p_status != "paid":
            continue
        if payment_status == "unpaid" and p_status not in ["pending", "unpaid"]:
            continue

        # Period calculation
        if is_in_period:
            deposit = o.get("deposit_amount") or 0
            balance_due = curr_amount - deposit
            
            # Revenue = Deposits (all) + Balance (only if PAID)
            rev_contribution = deposit + (balance_due if p_status == 'paid' else 0)
            period_revenue += rev_contribution
            
            # Payment Method Stats for period (Pro-rated based on contribution to revenue)
            if rev_contribution > 0:
                method = o.get("paymentMethod") or "cash"
                if method not in pm_stats:
                    pm_stats[method] = {"method": method, "amount": 0, "count": 0}
                pm_stats[method]["amount"] += rev_contribution
                pm_stats[method]["count"] += 1

        # Today's specific cards
        if is_today:
            today_order_count += 1
            deposit = o.get("deposit_amount") or 0
            balance_due = curr_amount - deposit
            # Today Revenue = All deposits from today + today's PAID balances
            today_revenue += deposit + (balance_due if p_status == 'paid' else 0)

    # Calculate Global Total Unpaid Balance (Regardless of filters)
    # We need to fetch all unpaid orders to get the real total, but for performance 
    # and "heartbeat" feedback, we can base it on the current month's data if acceptable,
    # OR better: run a quick separate count for true accuracy.
    
    unpaid_query = supabase.table("orders").select("amount, deposit_amount").in_("paymentStatus", ["pending", "unpaid"]).neq("status", "cancelled")
    unpaid_response = await run_in_threadpool(unpaid_query.execute)
    unpaid_orders = unpaid_response.data or []
    total_unpaid_balance = sum((uo.get("amount") or 0) - (uo.get("deposit_amount") or 0) for uo in unpaid_orders)

    return {
        "periodRevenue": period_revenue,
        "todayRevenue": today_revenue,
        "todayOrders": today_order_count,
        "totalUnpaidBalance": total_unpaid_balance,
        "collections": list(pm_stats.values()),
    }
@router.get("/ai-summary")
async def get_ai_summary(
    current_user: dict = Depends(require_super_admin),
):
    """
    AI 营业额监督助手：分析波动、预测趋势、检测异常
    """
    from fastapi.concurrency import run_in_threadpool
    from datetime import datetime, timezone, timedelta
    import dateutil.parser
    import calendar

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # 1. 获取过去 14 天的所有已完成订单用于计算平均值 (增加窗口冗余)
    history_start = today_start - timedelta(days=14)
    history_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("amount, dueTime, created_at, paymentStatus, deposit_amount")
        .gte("created_at", history_start.isoformat())
        .neq("status", "cancelled")
        .execute
    )
    history_orders = history_resp.data or []
    
    daily_revenue = {}
    for o in history_orders:
        amount = o.get("amount") or 0
        deposit = o.get("deposit_amount") or 0
        balance = amount - deposit
        p_status = o.get("paymentStatus")
        
        # Contribution to revenue: deposit + (balance if paid)
        rev_contribution = deposit + (balance if p_status == 'paid' else 0)
        if rev_contribution <= 0: continue
        
        try:
            dt_str = o.get("dueTime") or o.get("created_at")
            dt = dateutil.parser.isoparse(dt_str).strftime("%Y-%m-%d")
            daily_revenue[dt] = daily_revenue.get(dt, 0) + rev_contribution
        except: continue

    # 计算 7 天平均值 (不含今天)
    today_str = now.strftime("%Y-%m-%d")
    other_days_revenue = [v for k, v in daily_revenue.items() if k != today_str]
    avg_7d = sum(other_days_revenue) / len(other_days_revenue) if other_days_revenue else 0
    today_rev = daily_revenue.get(today_str, 0)

    # 2. 计算月度环比增长 (MTD vs Last Month MTD)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # 上月同期起点与终点
    last_month_end = (month_start - timedelta(days=1)).replace(day=now.day, hour=23, minute=59, second=59)
    # 处理日期溢出（例如 3月31日对应2月28/29日）
    last_month_days = calendar.monthrange((month_start - timedelta(days=1)).year, (month_start - timedelta(days=1)).month)[1]
    if now.day > last_month_days:
        last_month_end = last_month_end.replace(day=last_month_days)
    
    last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 获取本月至今与上月同期的订单
    comparison_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("amount, paymentStatus, deposit_amount, created_at")
        .gte("created_at", last_month_start.isoformat())
        .neq("status", "cancelled")
        .execute
    )
    comp_orders = comparison_resp.data or []
    
    mtd_rev = 0
    last_mtd_rev = 0
    
    for o in comp_orders:
        amt = o.get("amount") or 0
        dep = o.get("deposit_amount") or 0
        p_stat = o.get("paymentStatus")
        contrib = dep + ((amt - dep) if p_stat == 'paid' else 0)
        
        ca = dateutil.parser.isoparse(o.get("created_at"))
        if ca >= month_start:
            mtd_rev += contrib
        elif last_month_start <= ca <= last_month_end:
            last_mtd_rev += contrib

    # 3. 线性预测本月总额
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    predicted_total = (mtd_rev / now.day) * days_in_month if now.day > 0 else 0

    # 4. 异常检测：高额未付订单 (> RM 500)
    unpaid_high_value = [o for o in comp_orders if dateutil.parser.isoparse(o.get("created_at")) >= month_start and o.get("paymentStatus") != "paid" and float(o.get("amount", 0)) > 500]

    # 5. 波动预警与分析
    warnings = []
    if avg_7d > 0 and today_rev < (avg_7d * 0.3):
        warnings.append({
            "type": "low_revenue",
            "message": f"今日营收 (RM {today_rev:.2f}) 低于过去 7 天平均水平的 30%，建议检查运营。",
            "severity": "warning"
        })
    
    if last_mtd_rev > 0 and mtd_rev < last_mtd_rev * 0.8:
        warnings.append({
            "type": "mtd_decline",
            "message": f"本月进度 (RM {mtd_rev:.2f}) 较上月同期 (RM {last_mtd_rev:.2f}) 落后超过 20%。",
            "severity": "info"
        })

    return {
        "today_vs_avg": {
            "today": today_rev,
            "avg_7d": avg_7d,
            "ratio": (today_rev / avg_7d) if avg_7d > 0 else 1
        },
        "monthly_growth": (mtd_rev - last_mtd_rev) / last_mtd_rev if last_mtd_rev > 0 else 0,
        "prediction": {
            "current": mtd_rev,
            "predicted": predicted_total,
            "days_passed": now.day,
            "total_days": days_in_month
        },
        "anomalies": [
            {
                "id": f"KM-{now.strftime('%y%m')}-XXX",
                "amount": float(o.get("amount", 0)),
                "status": "unpaid"
            } for o in unpaid_high_value[:3]
        ],
        "warnings": warnings
    }
