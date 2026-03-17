from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from database import supabase
from models import Customer, CustomerCreate, CustomerUpdate
from fastapi.concurrency import run_in_threadpool
from middleware.auth import require_admin, get_current_user
from services.audit import record_audit, AuditActions

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
async def create_customer(
    customer: CustomerCreate,
    current_user: dict = Depends(get_current_user)
):
    customer_data = customer.model_dump(exclude_none=True)
    try:
        response = await run_in_threadpool(
            supabase.table("customers").insert(customer_data).execute
        )
        if not response.data:
            raise HTTPException(status_code=400, detail="Could not create customer")
        
        await record_audit(
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            action=AuditActions.CUSTOMER_CREATE,
            target=response.data[0]["id"],
            detail=customer_data
        )
        return response.data[0]
    except Exception as e:
        if "duplicate key value" in str(e):
            raise HTTPException(status_code=400, detail="Phone number already exists")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{customer_id}", response_model=Customer)
async def update_customer(
    customer_id: str, 
    update: CustomerUpdate,
    current_user: dict = Depends(get_current_user)
):
    update_data = update.model_dump(exclude_none=True)
    response = await run_in_threadpool(
        supabase.table("customers").update(update_data).eq("id", customer_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.CUSTOMER_UPDATE,
        target=customer_id,
        detail=update_data
    )
    return response.data[0]

@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: str,
    current_user: dict = Depends(require_admin)
):
    response = await run_in_threadpool(
        supabase.table("customers").delete().eq("id", customer_id).execute
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    await record_audit(
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        action=AuditActions.CUSTOMER_DELETE,
        target=customer_id
    )
    return {"message": "Customer deleted"}
