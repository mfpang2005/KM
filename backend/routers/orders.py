from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import supabase
from models import Order, OrderCreate, OrderUpdate, OrderStatus

router = APIRouter(
    prefix="/orders",
    tags=["orders"]
)

@router.get("", response_model=List[Order])
async def get_orders():
    # In a real app, we would join with order_items table. 
    # For now, assuming 'items' is stored as a JSONB column or similar for simplicity, 
    # OR we fetch items separately. 
    # Let's assume a flat structure for now or that Supabase returns the joined data if configured.
    # To keep it simple and aligned with the "no SQL" requirement from the prompt (it said "use Supabase"),
    # we'll use the JS/Python client which returns JSON.
    
    response = supabase.table("orders").select("*").execute()
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
