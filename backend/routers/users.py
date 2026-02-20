from fastapi import APIRouter, HTTPException
from typing import List
from database import supabase
from models import User, UserRole

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/", response_model=List[User])
async def get_users():
    response = supabase.table("users").select("*").execute()
    return response.data

@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str):
    response = supabase.table("users").select("*").eq("id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
    return response.data[0]

# Simple login simulation by checking email/role exists
@router.post("/login")
async def login(email: str, role: UserRole):
    # In a real app, use Supabase Auth (GoTrue).
    # Here we just check if a user with this email and role exists in our 'users' table
    response = supabase.table("users").select("*").eq("email", email).eq("role", role).execute()
    if not response.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return response.data[0]
