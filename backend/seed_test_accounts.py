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
        # 1. Try to create user in auth schema
        try:
            res = supabase.auth.admin.create_user({
                "email": acc["email"],
                "password": acc["password"],
                "email_confirm": True,
                "user_metadata": {"role": acc["role"]}
            })
            user_id = res.user.id
            print(f"Auth user created: {acc['email']} ({user_id})")
        except Exception as e:
            if "already been registered" in str(e):
                # 2. If already exists, we need to list users to find the ID (Admin API)
                users_list = supabase.auth.admin.list_users()
                target_user = next((u for u in users_list if u.email == acc["email"]), None)
                if target_user:
                    user_id = target_user.id
                    print(f"Found existing auth user: {acc['email']} ({user_id})")
                else:
                    print(f"Critical error: Account says registered but not found in list for {acc['email']}")
                    continue
            else:
                print(f"Failed to process {acc['email']}: {e}")
                continue
        
        # 3. Force upsert to public.users
        supabase.table("users").upsert({
            "id": user_id,
            "email": acc["email"],
            "role": acc["role"],
            "name": acc["name"],
            "status": "active"
        }).execute()
        print(f"Successfully synced {acc['email']} to public.users")
        
    except Exception as e:
        print(f"Global error for {acc['email']}: {e}")
