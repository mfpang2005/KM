import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
    sys.exit(1)

supabase: Client = create_client(url, key)

def create_super_admin():
    email = "acc.kimlonggroup@gmail.com"
    password = "password123"
    name = "Super Admin Tester"
    role = "super_admin"

    print(f"Ensuring SuperAdmin exists: {email}")

    try:
        # 1. Try to create in Auth (using Admin API)
        try:
            res = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"role": role, "name": name}
            })
            user_id = res.user.id
            print(f"Auth user created: {user_id}")
        except Exception as e:
            if "already been registered" in str(e):
                print("Auth user already exists, searching for ID...")
                # Find user ID by email
                users_list = supabase.auth.admin.list_users()
                target = next((u for u in users_list if u.email == email), None)
                if target:
                    user_id = target.id
                    print(f"Found existing ID: {user_id}")
                else:
                    print("Error: Registered but not found in list")
                    return
            else:
                print(f"Auth error: {e}")
                return

        # 2. Sync to public.users table
        try:
            res = supabase.table("users").upsert({
                "id": str(user_id),
                "email": email,
                "role": role,
                "name": name
            }).execute()
            print(f"Successfully synced to public.users table.")
        except Exception as e:
            print(f"Table sync error: {e}")

    except Exception as e:
        print(f"Global error: {e}")

if __name__ == "__main__":
    create_super_admin()
