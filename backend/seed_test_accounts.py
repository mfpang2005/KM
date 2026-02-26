import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(url, key)

accounts = [
    {"email": "test_admin1@example.com", "password": "password123", "role": "admin", "name": "Admin Tester"},
    {"email": "test_kitchen1@example.com", "password": "password123", "role": "kitchen", "name": "Kitchen Tester"},
    {"email": "test_driver1@example.com", "password": "password123", "role": "driver", "name": "Driver Tester"}
]

for acc in accounts:
    try:
        # Create user in auth schema
        res = supabase.auth.admin.create_user({
            "email": acc["email"],
            "password": acc["password"],
            "email_confirm": True
        })
        user = res.user
        print(f"Created auth user: {acc['email']} with ID: {user.id}")
        
        # update public.users
        supabase.table("users").update({
            "role": acc["role"],
            "name": acc["name"],
            "status": "active"
        }).eq("id", user.id).execute()
        print(f"Updated public user role to {acc['role']}")
        
    except Exception as e:
        print(f"Error creating {acc['email']}: {e}")
