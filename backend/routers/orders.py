from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import supabase
from models import Order, OrderCreate, OrderStatus

router = APIRouter(
    prefix="/orders",
    tags=["orders"]
)

@router.get("/", response_model=List[Order])
async def get_orders():
    # In a real app, we would join with order_items table. 
    # For now, assuming 'items' is stored as a JSONB column or similar for simplicity, 
    # OR we fetch items separately. 
    # Let's assume a flat structure for now or that Supabase returns the joined data if configured.
    # To keep it simple and aligned with the "no SQL" requirement from the prompt (it said "use Supabase"),
    # we'll use the JS/Python client which returns JSON.
    
    response = supabase.table("orders").select("*").execute()
    return response.data

@router.get("/{order_id}", response_model=Order)
async def get_order(order_id: str):
    response = supabase.table("orders").select("*").eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return response.data[0]

@router.post("/", response_model=Order)
async def create_order(order: OrderCreate):
    # Depending on how we structure the DB, we might need to insert into 'orders' and 'order_items'
    # For this POC, let's assume 'items' is a JSONB column in 'orders' table to save time and complexity,
    # or we handle the relation insert.
    # Let's try to insert the whole object. Supabase handles JSONB well.
    
    order_data = order.dict()
    # If 'items' is a relation, we need to pop it and insert separately. 
    # For simplicity in this iteration, I'll assume we can store it as JSONB in the 'orders' table 
    # OR I'll assume the frontend sends what the DB expects.
    # Let's go with JSONB for 'items' for now to speed up development unless strict relational schema is required.
    # However, standard practice is normalized.
    # Let's assume the DB has an 'items' jsonb column for now to match the frontend 'items' array.
    
    response = supabase.table("orders").insert(order_data).execute()
    if not response.data:
         raise HTTPException(status_code=400, detail="Could not create order")
    return response.data[0]

@router.put("/{order_id}", response_model=Order)
async def update_order(order_id: str, order: OrderCreate):
    response = supabase.table("orders").update(order.dict()).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found or update failed")
    return response.data[0]

@router.post("/{order_id}/status", response_model=Order)
async def update_order_status(order_id: str, status: OrderStatus):
    response = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Order not found")
    return response.data[0]

@router.delete("/{order_id}")
async def delete_order(order_id: str):
    response = supabase.table("orders").delete().eq("id", order_id).execute()
    return {"message": "Order deleted"}
