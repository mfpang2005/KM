from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from database import supabase
from models import Order, OrderCreate, OrderUpdate, OrderStatus
from fastapi.concurrency import run_in_threadpool
from middleware.auth import get_current_user, require_admin
from services.audit import record_audit, AuditActions

router = APIRouter(
    prefix="/orders",
    tags=["orders"]
)

async def _sync_items_to_table(order_id: str, items: list):
    """
    辅助函数：将订单项同步到 order_items 表。
    采用先删后增的策略确保与 orders 表中的 JSON 数据保持一致。
    """
    if not items:
        return
    
    try:
        from fastapi.concurrency import run_in_threadpool
        # 1. 清除旧数据
        await run_in_threadpool(
            supabase.table("order_items").delete().eq("order_id", order_id).execute
        )
        
        # 2. 准备新数据
        prep_items = []
        for item in items:
            prep_items.append({
                "order_id": order_id,
                "product_id": item.get("id"),
                "name": item.get("name", "Unnamed Item"),
                "quantity": item.get("quantity", 1),
                "status": item.get("status", "pending"),
                "is_prepared": item.get("is_prepared", False),
                "note": item.get("note"),
                "price": item.get("price", 0)
            })
        
        # 3. 批量插入
        if prep_items:
            await run_in_threadpool(
                supabase.table("order_items").insert(prep_items).execute
            )
            
    except Exception as e:
        # 即使同步失败也不中断主流程
        print(f"WARNING: Failed to sync items for order {order_id}: {e}")


@router.get("", response_model=List[Order])
async def get_orders(
    status: Optional[str] = None, 
    sort_by: str = "created_at", 
    order: str = "desc"
):
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    # Include orders created in the last year or due in the future
    window_start = (now - timedelta(days=365)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
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
async def update_delivery_photos(order_id: str, photos: dict, current_user: dict = Depends(get_current_user)):
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
    
    # Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.ORDER_UPDATE_PHOTOS,
        target=order_id,
        detail={"photo_count": len(photo_urls)}
    )
    
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
async def mark_item_prepared(item_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
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
        
        # Record Audit
        await record_audit(
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            action=AuditActions.ORDER_ITEM_PREPARED,
            target=item_id,
            detail={"is_prepared": is_prepared}
        )
        
        return response.data[0]
    except postgrest.exceptions.APIError as e:
        err_msg = str(e)
        if "PGRST205" in err_msg or "22P02" in err_msg:
            # 假装更新成功，不阻塞前端流程 (这种情况通常发生在旧数据未同步到 order_items 表时)
            return {"id": item_id, "is_prepared": is_prepared, "status": "ready" if is_prepared else "pending"}
        raise e


@router.get("/{order_id:path}", response_model=Order)
async def get_order(order_id: str):
    response = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return response.data[0]

@router.post("", response_model=Order)
async def create_order(
    order: OrderCreate,
    current_user: dict = Depends(get_current_user)
):
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
    # Generate custom order ID: KM-YY/MM/DD/xxx
    if 'id' not in order_data or not order_data['id']:
        from datetime import datetime
        today_str = datetime.now().strftime("%y/%m/%d")
        prefix = f"KM-{today_str}/"
        
        # Query existing orders with the same day prefix to determine the next sequence number
        res = supabase.table("orders").select("id").ilike("id", f"{prefix}%").execute()
        
        max_num = 0
        if res.data:
            for row in res.data:
                try:
                    # Extract the last part of the ID (the sequence number)
                    parts = row['id'].split('/')
                    if parts:
                        num = int(parts[-1])
                        if num > max_num:
                            max_num = num
                except (ValueError, IndexError):
                    pass
        
        new_num = max_num + 1
        generated_id = f"{prefix}{new_num:03d}"
        
        # Set both id and order_number to the standard format
        order_data['id'] = generated_id
        order_data['order_number'] = generated_id

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
            
            # Sync items for granular production tracking
            items = order_data.get("items", [])
            await _sync_items_to_table(response.data[0]["id"], items)
            
            # Record Audit
            await record_audit(
                actor_id=current_user.get("id"),
                actor_role=current_user.get("role"),
                action=AuditActions.ORDER_CREATE,
                target=response.data[0]["id"],
                detail=order_data
            )
            
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
async def update_order(
    order_id: str, 
    order: OrderUpdate,
    current_user: dict = Depends(require_admin)
):
    from services.google_calendar import sync_order_to_calendar
    
    # model_dump handles Enum to string and applies validation/automation from model_validator
    order_data = order.model_dump(exclude_unset=True)
    
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
            
            # Sync items if provided
            if "items" in order_data:
                await _sync_items_to_table(order_id, order_data["items"])
            
            # Record Audit
            await record_audit(
                actor_id=current_user.get("id"),
                actor_role=current_user.get("role"),
                action=AuditActions.ORDER_UPDATE,
                target=order_id,
                detail=order_data
            )
            
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

@router.patch("/{order_id:path}/approve")
async def approve_order(
    order_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    管理员手动审批订单，直接标记为 ready (跳过厨房准备 / 快捷准备)。
    """
    from services.goeasy import notify_kitchen_complete

    # 1. 更新订单状态为 ready
    response = await run_in_threadpool(
        supabase.table("orders")
        .update({"status": "ready"})
        .eq("id", order_id)
        .execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")

    order_data = response.data[0]

    # 2. 将关联的所有项也标记为 ready (防止厨房页面残留)
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
            print(f"Error updating order items during approval: {e}")

    # 3. 发送 GoEasy 通知通知司机和管理员
    await notify_kitchen_complete(order_data)

    # 4. 记录审计日志
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.ORDER_STATUS_CHANGE,
        target=order_id,
        detail={"status": "ready", "method": "manual_approve"}
    )

    return order_data


@router.post("/{order_id:path}/status", response_model=Order)
async def update_order_status(
    order_id: str, 
    status: OrderStatus,
    current_user: dict = Depends(require_admin)
):
    response = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # GoEasy Notification
    from services.goeasy import notify_order_update
    await notify_order_update(response.data[0], action="status_update")
    
    # Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.ORDER_STATUS_CHANGE,
        target=order_id,
        detail={"status": status}
    )
    
    return response.data[0]

@router.patch("/{order_id:path}", response_model=Order)
async def partial_update_order(
    order_id: str, 
    update: OrderUpdate,
    current_user: dict = Depends(require_admin)
):
    from services.google_calendar import sync_order_to_calendar
    
    # First fetch the existing full order to have all data for calendar sync and balance calc
    old_res = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    old_order = old_res.data[0]
    
    # ENFORCE FINANCE LOGIC ON PARTIAL UPDATE
    update_data = update.model_dump(exclude_unset=True)
    
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
    
    # Sync items if provided in partial update
    if "items" in update_data:
        await _sync_items_to_table(order_id, update_data["items"])
    
    # Determine Audit Action
    audit_action = AuditActions.ORDER_UPDATE
    if "driverId" in update_data:
        if update_data["driverId"] is None:
            audit_action = AuditActions.ORDER_UNASSIGN_DRIVER
        else:
            audit_action = AuditActions.ORDER_ASSIGN_DRIVER

    # Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=audit_action,
        target=order_id,
        detail=update_data
    )
    
    return response.data[0]

@router.delete("/{order_id:path}")
async def delete_order(
    order_id: str,
    current_user: dict = Depends(require_admin)
):
    from services.google_calendar import delete_calendar_event
    from fastapi.concurrency import run_in_threadpool
    import postgrest
    
    # 1. Retrieve to get calendar_event_id before deletion
    res = supabase.table("orders").select("calendar_event_id").eq("id", order_id).execute()
    
    # 2. Delete related order_items first (Avoid Foreign Key constraint violation)
    try:
        await run_in_threadpool(
            supabase.table("order_items")
            .delete()
            .eq("order_id", order_id)
            .execute
        )
    except postgrest.exceptions.APIError as e:
        # Ignore Table missing (PGRST205) but fail on other DB errors
        if "PGRST205" not in str(e):
            print(f"Error deleting items for order {order_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to clear dependent order items: {str(e)}")

    # 3. Delete the order itself
    response = supabase.table("orders").delete().eq("id", order_id).execute()
    
    # 4. Cleanup external resources (Calendar)
    if res.data and res.data[0].get("calendar_event_id"):
        delete_calendar_event(res.data[0]["calendar_event_id"])
        
    # 5. GoEasy Notification
    from services.goeasy import publish_message
    await publish_message({
        "type": "order_update",
        "action": "delete",
        "orderId": order_id
    })
    
    # 6. Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.ORDER_DELETE,
        target=order_id
    )
        
    return {"message": "Order deleted"}


@router.post("/{order_id:path}/assign", response_model=Order)
async def assign_driver(
    order_id: str, 
    payload: dict,
    current_user: dict = Depends(require_admin)
):
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
    
    # Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.ORDER_ASSIGN_DRIVER,
        target=order_id,
        detail={"driverId": driver_id}
    )
    
    return response.data[0]







# ─── Kitchen Prep Endpoints ──────────────────────────────────────────────────





@router.post("/{order_id:path}/kitchen-complete")
async def kitchen_complete(
    order_id: str,
    current_user: dict = Depends(get_current_user)
):
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

    # Record Audit
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.KITCHEN_COMPLETE,
        target=order_id
    )

    return {"message": "Order marked as ready", "orderId": order_id, "status": "ready"}
