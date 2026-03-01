import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def check():
    try:
        res = supabase.table("users").select("id, email, role").execute()
        print(f"Users found in public.users: {len(res.data)}")
        for u in res.data:
            print(f"- {u['email']} (Role: {u['role']}, ID: {u['id']})")
            
        # Also check what auth users exist
        res_auth = supabase.auth.admin.list_users()
        print(f"Auth users found: {len(res_auth)}")
        for u in res_auth:
             print(f"- Auth: {u.email} (ID: {u.id}, Metadata: {u.user_metadata})")
    except Exception as e:
        print(f"Error checking users: {e}")

if __name__ == "__main__":
    check()
