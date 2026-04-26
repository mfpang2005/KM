from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from database import supabase
from models import InventoryItem, InventoryLog
from pydantic import BaseModel
import uuid
from middleware.auth import require_admin, get_current_user
from services.audit import record_audit, AuditActions
from fastapi.concurrency import run_in_threadpool
from datetime import datetime

router = APIRouter(
    prefix="/inventory",
    tags=["inventory"]
)

class InventoryItemCreate(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    unit: Optional[str] = None
    unit_price: float = 0.0
    stock_quantity: float = 0.0
    min_threshold: float = 0.0
    max_threshold: float = 0.0

class StockAdjustment(BaseModel):
    item_id: str
    type: str  # 'IN', 'OUT', 'ADJUST'
    quantity: float
    remark: Optional[str] = None

@router.get("/items", response_model=List[InventoryItem])
async def get_inventory_items():
    response = await run_in_threadpool(supabase.table("inventory_items").select("*").order("created_at", desc=True).execute)
    return response.data

@router.post("/items", response_model=InventoryItem)
async def create_inventory_item(
    item: InventoryItemCreate,
    current_user: dict = Depends(require_admin)
):
    data = item.model_dump()
    data["id"] = str(uuid.uuid4())
    
    response = await run_in_threadpool(supabase.table("inventory_items").insert(data).execute)
    
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action="INVENTORY_CREATE",
        target=data["id"],
        detail=data
    )
    return response.data[0]

@router.put("/items/{item_id}", response_model=InventoryItem)
async def update_inventory_item(
    item_id: str,
    item_update: dict,
    current_user: dict = Depends(require_admin)
):
    item_update["updated_at"] = datetime.utcnow().isoformat()
    response = await run_in_threadpool(
        supabase.table("inventory_items").update(item_update).eq("id", item_id).execute
    )
    
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action="INVENTORY_UPDATE",
        target=item_id,
        detail=item_update
    )
    return response.data[0]

@router.post("/adjust")
async def adjust_stock(
    adjustment: StockAdjustment,
    current_user: dict = Depends(require_admin)
):
    # 1. Get current stock
    item_res = await run_in_threadpool(supabase.table("inventory_items").select("stock_quantity, name").eq("id", adjustment.item_id).single().execute)
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Item not found")
    
    current_qty = item_res.data["stock_quantity"]
    new_qty = current_qty
    
    if adjustment.type == 'IN':
        new_qty += adjustment.quantity
    elif adjustment.type == 'OUT':
        new_qty -= adjustment.quantity
    elif adjustment.type == 'ADJUST':
        new_qty = adjustment.quantity
    
    # 2. Update stock
    await run_in_threadpool(supabase.table("inventory_items").update({"stock_quantity": new_qty}).eq("id", adjustment.item_id).execute)
    
    # 3. Log the change
    log_data = {
        "id": str(uuid.uuid4()),
        "item_id": adjustment.item_id,
        "type": adjustment.type,
        "quantity": adjustment.quantity,
        "user_id": current_user.get("id"),
        "remark": adjustment.remark
    }
    await run_in_threadpool(supabase.table("inventory_logs").insert(log_data).execute)
    
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=f"INVENTORY_{adjustment.type}",
        target=adjustment.item_id,
        detail={"old_qty": current_qty, "new_qty": new_qty, "adjustment": adjustment.model_dump()}
    )
    
    return {"message": "Stock adjusted successfully", "new_quantity": new_qty}

@router.get("/logs", response_model=List[dict])
async def get_inventory_logs(item_id: Optional[str] = None):
    # Join with inventory_items to get the name for the frontend
    query = supabase.table("inventory_logs").select("*, inventory_items(name)").order("created_at", desc=True)
    if item_id:
        query = query.eq("item_id", item_id)
    
    response = await run_in_threadpool(query.execute)
    return response.data

@router.delete("/items/{item_id}")
async def delete_inventory_item(
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    # Note: inventory_logs should have ON DELETE CASCADE or we handle it manually
    # For safety, let's just delete the item. Supabase should handle foreign keys if configured.
    response = await run_in_threadpool(
        supabase.table("inventory_items").delete().eq("id", item_id).execute
    )
    
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action="INVENTORY_DELETE",
        target=item_id,
        detail={"id": item_id}
    )
    return {"message": "Item deleted successfully"}
