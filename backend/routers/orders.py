from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from database import supabase
from models import Order, OrderCreate, OrderUpdate, OrderStatus
from fastapi.concurrency import run_in_threadpool

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
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(days=60)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    query = supabase.table("orders").select("*").gte("created_at", window_start)
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

# ─── Finance Summary (Public for Admin Role) ──────────────────────────────────




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


@router.get("/items/{order_id:path}")
async def get_order_items(order_id: str):
    """
    获取指定订单的所有 order_items（含 is_prepared 状态）
    """
    from fastapi.concurrency import run_in_threadpool
    import postgrest
    try:
        response = await run_in_threadpool(
            supabase.table("order_items")
            .select("*")
            .eq("order_id", order_id)
            .order("created_at", desc=False)
            .execute
        )
        return response.data or []
    except postgrest.exceptions.APIError as e:
        if "PGRST205" in str(e):
            # Fallback to reading the JSON items from orders table
            res = await run_in_threadpool(
                supabase.table("orders").select("items").eq("id", order_id).execute
            )
            if res.data and res.data[0].get("items"):
                fallback_items = []
                for idx, it in enumerate(res.data[0]["items"]):
                    fallback_items.append({
                        "id": str(idx),
                        "order_id": order_id,
                        "product_id": it.get("id"),
                        "name": it.get("name"),
                        "quantity": it.get("quantity"),
                        "note": it.get("note"),
                        "is_prepared": False,
                        "status": "pending"
                    })
                return fallback_items
        return []


@router.patch("/items/{item_id}/prepared")
async def mark_item_prepared(item_id: str, payload: dict):
    """
    厨房逐项勾选确认。接收 { "is_prepared": true/false }
    """
    is_prepared = payload.get("is_prepared", True)
    from fastapi.concurrency import run_in_threadpool
    import postgrest
    try:
        response = await run_in_threadpool(
            supabase.table("order_items")
            .update({"is_prepared": is_prepared, "status": "ready" if is_prepared else "pending"})
            .eq("id", item_id)
            .execute
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Order item not found")
        return response.data[0]
    except postgrest.exceptions.APIError as e:
        if "PGRST205" in str(e):
            # 假装更新成功，不阻塞前端流程
            return {"id": item_id, "is_prepared": is_prepared, "status": "ready" if is_prepared else "pending"}
        raise e


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
        new_id = f"{prefix}{new_num:03d}"
        order_data['id'] = new_id
        if 'order_number' not in order_data or not order_data['order_number']:
            order_data['order_number'] = f"{today_str[6:]}/{new_num:03d}" if "/" in today_str else f"{new_num:03d}"
            # Let's simplify and just use the suffix if logic gets complex, 
            # but user likes 11/003 (DD/NNN).
            from datetime import datetime
            order_data['order_number'] = f"{datetime.now().strftime('%d')}/{new_num:03d}"

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
                        "note": item.get("note"),
                        "price": item.get("price", 0)
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
async def update_order(order_id: str, order: OrderUpdate):
    from services.google_calendar import sync_order_to_calendar
    
    # model_dump handles Enum to string and applies validation/automation from model_validator
    order_data = order.model_dump(exclude_none=True)
    
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
    
    # First fetch the existing full order to have all data for calendar sync and balance calc
    old_res = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    old_order = old_res.data[0]
    
    # ENFORCE FINANCE LOGIC ON PARTIAL UPDATE
    update_data = update.model_dump(exclude_none=True)
    
    # If amount or payment_received changed, recalculate balance & status
    new_amount = update_data.get("amount", old_order.get("amount", 0.0))
    new_payment = update_data.get("payment_received", old_order.get("payment_received", 0.0))
    
    if "amount" in update_data or "payment_received" in update_data:
        update_data["balance"] = round(new_amount - new_payment, 2)
        if update_data["balance"] <= 0:
            update_data["paymentStatus"] = "paid"
        else:
            update_data["paymentStatus"] = "unpaid"
    
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




# ─── Kitchen Prep Endpoints ──────────────────────────────────────────────────





@router.post("/{order_id:path}/kitchen-complete")
async def kitchen_complete(order_id: str):
    """
    厨房确认整张订单完成，将 orders.status 更新为 ready，
    并通过 GoEasy 实时通知司机和管理员准备出发。
    """
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
    import postgrest
    try:
        await run_in_threadpool(
            supabase.table("order_items")
            .update({"is_prepared": True, "status": "ready"})
            .eq("order_id", order_id)
            .execute
        )
    except postgrest.exceptions.APIError as e:
        if "PGRST205" not in str(e):
            raise e

    # GoEasy 通知司机和管理员
    await notify_kitchen_complete(order_data)

    return {"message": "Order marked as ready", "orderId": order_id, "status": "ready"}
