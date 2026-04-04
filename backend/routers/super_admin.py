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
from services.audit import record_audit, AuditActions
from middleware.auth import require_super_admin, require_admin
from datetime import datetime, timezone, timedelta
import dateutil.parser

router = APIRouter(
    prefix="/super-admin",
    tags=["super-admin"]
)


# ═══════════════════════════════════════════
# 1. 统计总览
# ═══════════════════════════════════════════

@router.get("/stats", response_model=StatsOverview)
async def get_stats_overview(
    current_user: dict = Depends(require_admin),
):
    """
    获取全局统计数据：订单总数、总营收、用户总数、各状态订单占比
    """
    from fastapi.concurrency import run_in_threadpool
    
    # Fetch orders with enough fields for timing and finance logic
    all_orders_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("id, order_number, status, amount, dueTime, created_at, payment_received, paymentStatus, paymentMethod, balance")
        .neq("status", "cancelled")
        .execute
    )
    all_orders_data = all_orders_resp.data or []

    # Business Timezone: GMT+8
    now_utc = datetime.now(timezone.utc)
    now_biz = now_utc + timedelta(hours=8)
    now_naive = now_biz.replace(tzinfo=None)
    today_str = now_naive.strftime("%Y-%m-%d")
    month_ago = now_naive - timedelta(days=31)

    total_orders = len(all_orders_data)
    total_revenue = 0.0
    today_orders = 0
    today_revenue = 0.0
    month_orders = 0
    month_revenue = 0.0
    total_unpaid = 0.0
    
    status_counts: dict[str, int] = {}

    def get_field(obj, *keys):
        for k in keys:
            if k in obj: return obj[k]
        return None

    for o in all_orders_data:
        # Status count (Normalized to lowercase for frontend mapping)
        s = str(o.get("status", "unknown")).lower()
        status_counts[s] = status_counts.get(s, 0) + 1
        
        # Amount extraction
        amt = float(get_field(o, "amount", "Amount") or 0.0)
        bal = float(get_field(o, "balance", "Balance") or 0.0)
        total_revenue += amt
        total_unpaid += bal

        # Date parsing
        due_raw = get_field(o, "dueTime", "duetime")
        ca_raw = get_field(o, "created_at", "createdAt")
        dt = None
        try:
            if due_raw: dt = dateutil.parser.parse(str(due_raw))
            elif ca_raw: dt = dateutil.parser.parse(str(ca_raw))
        except: continue
        if not dt: continue

        dt_naive = dt.replace(tzinfo=None)
        dt_str = dt_naive.strftime("%Y-%m-%d")
        
        # Today calculation
        is_today = (dt_str == today_str)
        if is_today:
            today_orders += 1
            today_revenue += amt 
            
        # Month calculation (Last 31 days)
        if dt_naive >= month_ago:
            month_orders += 1
            month_revenue += amt

    # Ensure Recent Activity shows the latest 20 orders by sorting descending
    all_orders_data.sort(key=lambda x: str(x.get('created_at', '')), reverse=True)

    # 拉取用户总数
    users_resp = await run_in_threadpool(supabase.table("users").select("id", count="exact").execute)
    total_users = users_resp.count if hasattr(users_resp, "count") else len(users_resp.data or [])

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "today_orders": today_orders,
        "today_revenue": round(today_revenue, 2),
        "month_revenue": round(month_revenue, 2),
        "month_orders": month_orders,
        "total_users": total_users,
        "total_unpaid": round(total_unpaid, 2),
        "orders_by_status": status_counts,
        "recent_orders": all_orders_data[:20]  
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
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.USER_UPDATE,
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

    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.USER_DELETE,
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

    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.CONFIG_UPDATE,
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
    action: Optional[str] = Query(None, description="操作类型筛选"),
    search: Optional[str] = Query(None, description="搜索关键词 (Target 或 Actor ID)"),
    current_user: dict = Depends(require_super_admin),
):
    """
    分页查询审计日志，支持操作类型筛选和关键字搜索，按时间倒序
    """
    offset = (page - 1) * page_size

    query = supabase.table("audit_logs").select("*", count="exact")
    
    if action:
        query = query.eq("action", action)
    
    if search:
        # Supabase Python client doesn't support complex OR filters easily in a single builder call
        # but we can use 'or' method with a string filter
        query = query.or_(f"target.ilike.%{search}%,actor_id.ilike.%{search}%")

    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(
        query.order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute
    )

    total = response.count if hasattr(response, "count") and response.count is not None else 0

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
    event_date: Optional[str] = Query(None, description="特定活动日期筛选 (YYYY-MM-DD)"),
    current_user: dict = Depends(require_admin),
):
    """
    获取财务汇总数据，支持范围过滤与支付状态过滤。
    统一逻辑：使用 dueTime 作为交付日期过滤。
    """
    from fastapi.concurrency import run_in_threadpool
    from datetime import datetime, timezone, timedelta
    import dateutil.parser

    # Business Timezone: GMT+8
    now_utc = datetime.now(timezone.utc)
    now_biz = now_utc + timedelta(hours=8)
    now_naive = now_biz.replace(tzinfo=None)
    today_str = now_naive.strftime("%Y-%m-%d")

    # Fetch orders without a restrictive created_at filter to avoid format mismatch issues.
    # We rely on Python logic (is_in_period) to filter the results.
    query = supabase.table("orders").select("*").neq("status", "cancelled")
    
    if event_date:
        # 只匹配 dueTime 的日期部分，因为 eventDate 列在数据库中不存在
        query = query.ilike("dueTime", f"{event_date}%")
    
    response = await run_in_threadpool(query.execute)
    all_orders = response.data or []

    period_revenue = 0
    period_order_count = 0
    today_revenue = 0
    today_order_count = 0
    pm_stats: dict = {}

    # Defensive helper to get values regardless of case
    def get_field(obj, *keys):
        for k in keys:
            if k in obj: return obj[k]
        return None

    for o in all_orders:
        amount = float(get_field(o, "amount", "Amount") or 0.0)
        payment_received = float(get_field(o, "payment_received", "paymentReceived") or 0.0)
        p_status = str(get_field(o, "paymentStatus", "paymentstatus", "payment_status") or "").lower()
        p_method = str(get_field(o, "paymentMethod", "paymentmethod", "payment_method") or "cash").lower()
        
        due_time_raw = get_field(o, "dueTime", "duetime", "due_time")
        created_at_raw = get_field(o, "created_at", "createdAt")
        
        # Robust Date Parsing - Using the more flexible dateutil.parser.parse
        dt = None
        try:
            if due_time_raw:
                dt = dateutil.parser.parse(str(due_time_raw))
            elif created_at_raw:
                dt = dateutil.parser.parse(str(created_at_raw))
        except:
            # Final fallback: Try to parse whatever date string we have without strict ISO
            continue
            
        if not dt: continue
        
        # Use the business-aware dates defined outside the loop (now_naive, today_str)
        dt_naive = dt.replace(tzinfo=None)
        dt_str = dt_naive.strftime("%Y-%m-%d")
        is_today = (dt_str == today_str)
        is_in_period = False
        
        if range == "today":
            is_in_period = is_today
        elif range == "month":
            # Change to last 31 days (inclusive)
            thirty_days_ago = now_naive - timedelta(days=31)
            is_in_period = (dt_naive >= thirty_days_ago)
        else: # all
            is_in_period = True
            
        # 1. Main Metrics
        if is_today:
            today_revenue += amount
            today_order_count += 1
            
        if is_in_period:
            period_revenue += amount
            period_order_count += 1
            
            # 2. Collection Stats (The core "Collection Data")
            # Logic: Use payment_received, but fallback to amount if status is paid
            actual_payment = payment_received
            if actual_payment == 0 and p_status == 'paid':
                actual_payment = amount
                
            if actual_payment > 0:
                if p_method not in pm_stats:
                    pm_stats[p_method] = {"method": p_method, "amount": 0.0, "count": 0}
                pm_stats[p_method]["amount"] = round(pm_stats[p_method]["amount"] + actual_payment, 2)
                pm_stats[p_method]["count"] += 1
        

        # (End of order loop)

    # Global Unpaid Total: SUM(balance)
    unpaid_query = supabase.table("orders").select("balance").neq("status", "cancelled").gt("balance", 0)
    unpaid_response = await run_in_threadpool(unpaid_query.execute)
    unpaid_orders = unpaid_response.data or []
    total_unpaid_balance = sum(round(float(uo.get("balance") or 0.0), 2) for uo in unpaid_orders)

    return {
        "periodRevenue": round(period_revenue, 2),
        "periodOrders": period_order_count,
        "todayRevenue": round(today_revenue, 2),
        "todayOrders": today_order_count,
        "totalUnpaidBalance": round(total_unpaid_balance, 2),
        "collections": list(pm_stats.values()),
    }
@router.get("/ai-summary")
async def get_ai_summary(
    current_user: dict = Depends(require_admin),
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
        .select("amount, dueTime, created_at, paymentStatus, payment_received")
        .gte("created_at", history_start.isoformat())
        .neq("status", "cancelled")
        .execute
    )
    history_orders = history_resp.data or []
    
    daily_revenue = {}
    for o in history_orders:
        payment = o.get("payment_received") or 0.0
        if payment <= 0: continue
        
        try:
            dt_str = o.get("dueTime") or o.get("created_at")
            dt = dateutil.parser.isoparse(dt_str).strftime("%Y-%m-%d")
            daily_revenue[dt] = daily_revenue.get(dt, 0) + payment
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
        .select("amount, paymentStatus, payment_received, created_at")
        .gte("created_at", last_month_start.isoformat())
        .neq("status", "cancelled")
        .execute
    )
    comp_orders = comparison_resp.data or []
    
    mtd_rev = 0
    last_mtd_rev = 0
    
    for o in comp_orders:
        amt = float(o.get("amount") or 0.0)
        pay = float(o.get("payment_received") or 0.0)
        
        ca = dateutil.parser.isoparse(o.get("created_at"))
        if ca >= month_start:
            mtd_rev += pay
        elif last_month_start <= ca <= last_month_end:
            last_mtd_rev += pay

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


