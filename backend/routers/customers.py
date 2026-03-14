from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from database import supabase
from models import Customer, CustomerCreate, CustomerUpdate
from fastapi.concurrency import run_in_threadpool

router = APIRouter(
    prefix="/customers",
    tags=["customers"]
)

@router.get("", response_model=List[Customer])
async def get_customers(
    q: Optional[str] = Query(None, description="Search by name or phone"),
    limit: int = 50
):
    """
    Get all customers or search by name/phone
    """
    query = supabase.table("customers").select("*")
    if q:
        # Search in name or phone
        query = query.or_(f"name.ilike.%{q}%,phone.ilike.%{q}%")
    
    response = await run_in_threadpool(
        query.limit(limit).order("name").execute
    )
    return response.data

@router.get("/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    response = await run_in_threadpool(
        supabase.table("customers").select("*").eq("id", customer_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return response.data[0]

@router.post("", response_model=Customer)
async def create_customer(customer: CustomerCreate):
    customer_data = customer.model_dump(exclude_none=True)
    try:
        response = await run_in_threadpool(
            supabase.table("customers").insert(customer_data).execute
        )
        if not response.data:
            raise HTTPException(status_code=400, detail="Could not create customer")
        return response.data[0]
    except Exception as e:
        if "duplicate key value" in str(e):
            raise HTTPException(status_code=400, detail="Phone number already exists")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, update: CustomerUpdate):
    update_data = update.model_dump(exclude_none=True)
    response = await run_in_threadpool(
        supabase.table("customers").update(update_data).eq("id", customer_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return response.data[0]

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str):
    response = await run_in_threadpool(
        supabase.table("customers").delete().eq("id", customer_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted"}
