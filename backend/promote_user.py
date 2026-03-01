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

def promote_user(email: str):
    print(f"\nProcessing: {email}")
    role = "super_admin"
    name = "Super Admin"
    
    try:
        # 1. 查找或创建 Auth 用户
        users_list = supabase.auth.admin.list_users()
        target = next((u for u in users_list if u.email == email), None)
        
        if not target:
            print(f"Creating new Auth user: {email}")
            res = supabase.auth.admin.create_user({
                "email": email,
                "password": "Password123!", # 初始密码
                "email_confirm": True,
                "user_metadata": {"role": role, "name": name}
            })
            user_id = res.user.id
        else:
            user_id = target.id
            print(f"Found existing Auth user: {user_id}")
            # 更新 Auth 元数据，确保包含 role
            supabase.auth.admin.update_user_by_id(
                user_id,
                {"user_metadata": {"role": role, "name": name}}
            )
            print("Updated Auth user metadata.")

        # 2. 同步到 public.users 表
        supabase.table("users").upsert({
            "id": str(user_id),
            "email": email,
            "role": role,
            "name": name
        }).execute()
        print(f"Successfully synced {email} to public.users as {role}.")

    except Exception as e:
        print(f"Error processing {email}: {e}")

if __name__ == "__main__":
    # 修复用户提到的两个可能的拼写
    promote_user("acc.kimlonggroup@gmail.com") # 双 o
    promote_user("acc.kimlonggrop@gmail.com")  # 单 o
