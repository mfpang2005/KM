import os
import logging
from dotenv import load_dotenv
from supabase import create_client

# Config logging to see everything
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

test_email = "test6_final@km.com"
test_password = "password123"
test_role = "driver"
test_name = "Test 6"
test_phone = "12345678"

print(f"--- Phase 1: Auth Creation ---")
try:
    auth_attributes = {
        "email": test_email,
        "password": test_password,
        "email_confirm": True,
        "user_metadata": {
            "role": test_role,
            "name": test_name
        }
    }
    auth_res = supabase.auth.admin.create_user(auth_attributes)
    
    user_id = None
    user_obj = getattr(auth_res, "user", None)
    if user_obj:
        user_id = getattr(user_obj, "id", None)
    
    if not user_id:
        print(f"Auth failed or no ID: {auth_res}")
        exit(1)
        
    print(f"Auth Success! User ID: {user_id}")

    print(f"\n--- Phase 2: DB Sync (Simplified Logic from admin_users.py) ---")
    db_data = {
        "id": user_id,
        "email": test_email,
        "role": test_role,
        "name": test_name,
        "phone": test_phone
    }
    
    # Try the "Full" insert first
    try:
        full_data = {
            **db_data,
            "status": "active",
            "is_disabled": False,
            "employee_id": "EMP-DEBUG-6"
        }
        print(f"Attempting Full Insert: {full_data}")
        response = supabase.table("users").insert(full_data).execute()
        print(f"Full Insert Response: {response}")
    except Exception as full_err:
        print(f"Full Insert Failed: {full_err}")
        print("Falling back to Basic Insert...")
        basic_data = {k: v for k, v in db_data.items() if v is not None}
        print(f"Attempting Basic Insert: {basic_data}")
        response = supabase.table("users").insert(basic_data).execute()
        print(f"Basic Insert Response: {response}")

except Exception as e:
    print(f"CRITICAL ERROR: {e}")
