from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from database import supabase
from models import Order, OrderCreate, OrderUpdate, OrderStatus

router = APIRouter(
    prefix="/orders",
    tags=["orders"]
)

@router.get("", response_model=List[Order])
async def get_orders(
    status: Optional[str] = None, 
    sort_by: str = "created_at", 
    order: str = "desc"
):
    from fastapi.concurrency import run_in_threadpool
    query = supabase.table("orders").select("*")
    if status and status != 'all':
        query = query.eq("status", status)
    
    # Map 'asc'/'desc' to boolean for supabase-py (if needed) or use string
    is_desc = order.lower() == "desc"
    
    response = await run_in_threadpool(
        query.order(sort_by, desc=is_desc)
        .limit(200)  # Increase limit to 200 for better visibility
        .execute
    )
    return response.data

@router.get("/{order_id:path}", response_model=Order)
async def get_order(order_id: str):
    response = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return response.data[0]

@router.post("", response_model=Order)
async def create_order(order: OrderCreate):
    """
    创建新订单并写入数据库。
    - 自动生成 UUID 作为订单 ID（防止 DB 未设置 default gen_random_uuid()）
    - 若数据库 schema 尚未完成迁移（缺列），自动过滤未知字段后重试
    """
    import re
    import uuid
    from services.google_calendar import sync_order_to_calendar
    from services.goeasy import publish_message, notify_order_update

    order_data = order.model_dump(mode='json', exclude_none=True)
    # Ensure status is set to pending if missing
    if 'status' not in order_data or not order_data['status']:
        order_data['status'] = 'pending'
    # Generate custom order ID: KM-YY/MM/DD/000
    if 'id' not in order_data or not order_data['id']:
        from datetime import datetime
        today_str = datetime.now().strftime("%y/%m/%d")
        prefix = f"KM-{today_str}/"
        res = supabase.table("orders").select("id").ilike("id", f"{prefix}%").execute()
        max_num = 0
        if res.data:
            for row in res.data:
                try:
                    num = int(row['id'].split('/')[-1])
                    if num > max_num:
                        max_num = num
                except:
                    pass
        new_num = max_num + 1
        order_data['id'] = f"{prefix}{new_num:03d}"

    # Sync to calendar BEFORE inserting into DB to get the event ID (if calendar is configured)
    calendar_event_id = sync_order_to_calendar(order_data)
    if calendar_event_id:
        order_data['calendar_event_id'] = calendar_event_id

    max_retries = 10
    for attempt in range(max_retries):
        try:
            response = supabase.table("orders").insert(order_data).execute()
            if not response.data:
                raise HTTPException(status_code=400, detail="Could not create order")
            
            # GoEasy Notification
            await notify_order_update(response.data[0], action="create")
            
            # Sync items to order_items table for granular production tracking
            items = order_data.get("items", [])
            if items:
                prep_items = []
                for item in items:
                    prep_items.append({
                        "order_id": response.data[0]["id"],
                        "name": item["name"],
                        "quantity": item["quantity"],
                        "status": "pending",
                        "note": item.get("note")
                    })
                try:
                    supabase.table("order_items").insert(prep_items).execute()
                except Exception as e:
                    # NOTE: If order_items table is missing (PGRST205), we log it but don't fail the order creation
                    # as orders table insertion was already successful.
                    print(f"WARNING: Failed to sync items to order_items (Table may be missing): {e}")
            
            return response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            # PGRST204: 列不在 schema cache，提取列名后移除再重试
            match = re.search(r"Could not find the '(\w+)' column", err_msg)
            if match:
                bad_col = match.group(1)
                order_data.pop(bad_col, None)
                continue
            # 其他错误直接抛出
            import traceback
            raise HTTPException(status_code=500, detail=traceback.format_exc())

    raise HTTPException(status_code=500, detail="Order creation failed after max retries")

@router.put("/{order_id:path}", response_model=Order)
async def update_order(order_id: str, order: dict):
    from services.google_calendar import sync_order_to_calendar
    
    order_data = {k: v for k, v in order.items() if v is not None}
    
    # Handle Enum to string conversion if needed
    if "status" in order_data and hasattr(order_data["status"], "value"):
        order_data["status"] = order_data["status"].value
    if "paymentMethod" in order_data and hasattr(order_data["paymentMethod"], "value"):
        order_data["paymentMethod"] = order_data["paymentMethod"].value
    
    # Retrieve old order to gracefully get calendar_event_id (using * to avoid PGRST204 if missing)
    try:
        old_res = supabase.table("orders").select("*").eq("id", order_id).execute()
        old_cal_id = old_res.data[0].get("calendar_event_id") if old_res.data else None
    except Exception:
        old_cal_id = None
    
    # Sync with calendar
    try:
        new_cal_id = sync_order_to_calendar(order_data, old_cal_id)
        if new_cal_id:
            order_data['calendar_event_id'] = new_cal_id
        elif old_cal_id:
            order_data['calendar_event_id'] = old_cal_id
    except Exception as e:
        print(f"Calendar sync failed during update: {e}")

    max_retries = 10
    import re
    for attempt in range(max_retries):
        try:
            response = supabase.table("orders").update(order_data).eq("id", order_id).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail="Order not found or update failed")
            
            # GoEasy Notification
            from services.goeasy import notify_order_update
            await notify_order_update(response.data[0], action="update")
            
            return response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            match = re.search(r"Could not find the '(\w+)' column", err_msg)
            if match:
                bad_col = match.group(1)
                order_data.pop(bad_col, None)
                continue
            import traceback
            raise HTTPException(status_code=500, detail=traceback.format_exc())

    raise HTTPException(status_code=500, detail="Order update failed after max retries")

@router.post("/{order_id:path}/status", response_model=Order)
async def update_order_status(order_id: str, status: OrderStatus):
    response = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # GoEasy Notification
    from services.goeasy import notify_order_update
    await notify_order_update(response.data[0], action="status_update")
    
    return response.data[0]

@router.patch("/{order_id:path}", response_model=Order)
async def partial_update_order(order_id: str, update: OrderUpdate):
    from services.google_calendar import sync_order_to_calendar
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    # Handle Enum to string conversion if needed
    if "status" in update_data:
        update_data["status"] = update_data["status"].value if hasattr(update_data["status"], "value") else update_data["status"]
    if "paymentMethod" in update_data:
        update_data["paymentMethod"] = update_data["paymentMethod"].value if hasattr(update_data["paymentMethod"], "value") else update_data["paymentMethod"]

    # First fetch the existing full order to have all data for calendar sync
    old_res = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    old_order = old_res.data[0]
    
    # Merge existing data with updates for Calendar sync
    merged_data = {**old_order, **update_data}
    
    old_cal_id = old_order.get("calendar_event_id")
    # Sync with calendar
    new_cal_id = sync_order_to_calendar(merged_data, old_cal_id)
    if new_cal_id:
        update_data['calendar_event_id'] = new_cal_id

    response = supabase.table("orders").update(update_data).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Update failed")
    
    # GoEasy Notification
    from services.goeasy import notify_order_update
    await notify_order_update(response.data[0], action="partial_update")
    
    return response.data[0]

@router.delete("/{order_id:path}")
async def delete_order(order_id: str):
    from services.google_calendar import delete_calendar_event
    
    # Retrieve to get calendar_event_id before deletion
    res = supabase.table("orders").select("calendar_event_id").eq("id", order_id).execute()
    
    response = supabase.table("orders").delete().eq("id", order_id).execute()
    
    if res.data and res.data[0].get("calendar_event_id"):
        delete_calendar_event(res.data[0]["calendar_event_id"])
        
    # GoEasy Notification
    from services.goeasy import publish_message
    await publish_message({
        "type": "order_update",
        "action": "delete",
        "orderId": order_id
    })
        
    return {"message": "Order deleted"}


@router.post("/{order_id:path}/assign", response_model=Order)
async def assign_driver(order_id: str, payload: dict):
    """
    指派司机。接收 { "driver_id": "uuid" }。
    """
    driver_id = payload.get("driver_id")
    if not driver_id:
        raise HTTPException(status_code=400, detail="driver_id is required")
        
    response = supabase.table("orders").update({"driverId": driver_id}).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # GoEasy Notification
    from services.goeasy import notify_order_update
    await notify_order_update(response.data[0], action="assign")
    
    return response.data[0]


# NOTE: 司机完成送餐后将照片 URL 列表写入对应订单，供 Admin 审阅
@router.patch("/{order_id:path}/photos")
async def update_delivery_photos(order_id: str, photos: dict):
    """
    接收 { "delivery_photos": [url1, url2, ...] } 并更新至对应订单
    """
    photo_urls = photos.get("delivery_photos", [])
    if not photo_urls:
        raise HTTPException(status_code=400, detail="No photos provided")
    response = (
        supabase.table("orders")
        .update({"delivery_photos": photo_urls})
        .eq("id", order_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return response.data[0]


# ─── Kitchen Prep Endpoints ──────────────────────────────────────────────────

@router.get("/items/{order_id}")
async def get_order_items(order_id: str):
    """
    获取指定订单的所有 order_items（含 is_prepared 状态）
    """
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(
        supabase.table("order_items")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=False)
        .execute
    )
    return response.data or []


@router.patch("/items/{item_id}/prepared")
async def mark_item_prepared(item_id: str, payload: dict):
    """
    厨房逐项勾选确认。接收 { "is_prepared": true/false }
    """
    is_prepared = payload.get("is_prepared", True)
    from fastapi.concurrency import run_in_threadpool
    response = await run_in_threadpool(
        supabase.table("order_items")
        .update({"is_prepared": is_prepared, "status": "ready" if is_prepared else "pending"})
        .eq("id", item_id)
        .execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Order item not found")
    return response.data[0]


@router.post("/{order_id}/kitchen-complete")
async def kitchen_complete(order_id: str):
    """
    厨房确认整张订单完成，将 orders.status 更新为 ready，
    并通过 GoEasy 实时通知司机和管理员准备出发。
    """
    from fastapi.concurrency import run_in_threadpool
    from services.goeasy import notify_kitchen_complete

    response = await run_in_threadpool(
        supabase.table("orders")
        .update({"status": "ready"})
        .eq("id", order_id)
        .execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")

    order_data = response.data[0]

    # 同时将该订单下所有 order_items 标记为 ready
    await run_in_threadpool(
        supabase.table("order_items")
        .update({"is_prepared": True, "status": "ready"})
        .eq("order_id", order_id)
        .execute
    )

    # GoEasy 通知司机和管理员
    await notify_kitchen_complete(order_data)

    return {"message": "Order marked as ready", "orderId": order_id, "status": "ready"}


# ─── Finance Summary (Public for Admin Role) ──────────────────────────────────

@router.get("/finance-summary")
async def get_finance_summary():
    """
    公开的财务汇总端点，供前端 Admin 首页使用（无需 super_admin 权限）。
    返回今日和本月已完成订单的总金额。
    """
    from fastapi.concurrency import run_in_threadpool
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    # 今日开始时间
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    # 本月开始时间
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # 本月已完成订单
    monthly_resp = await run_in_threadpool(
        supabase.table("orders")
        .select("amount, created_at")
        .eq("status", "completed")
        .gte("created_at", month_start)
        .execute
    )
    monthly_orders = monthly_resp.data or []

    daily_total = sum(
        (o.get("amount") or 0) for o in monthly_orders
        if o.get("created_at", "") >= today_start
    )
    monthly_total = sum(o.get("amount") or 0 for o in monthly_orders)

    # 读取月度目标配置（可选）
    goal = 0
    try:
        cfg_resp = supabase.table("system_config").select("value").eq("key", "finance_goal").execute()
        if cfg_resp.data:
            goal = cfg_resp.data[0].get("value", {}).get("amount", 0)
    except Exception:
        pass

    # 读取财务显示开关配置
    show_finance = True
    try:
        disp_resp = supabase.table("system_config").select("value").eq("key", "finance_display").execute()
        if disp_resp.data:
            show_finance = disp_resp.data[0].get("value", {}).get("enabled", True)
    except Exception:
        pass

    return {
        "daily": daily_total,
        "monthly": monthly_total,
        "monthlyGoal": goal,
        "showFinance": show_finance,
    }
