import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv("backend/.env")
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(url, key)

print("Fetching users from auth (requires service role key to work correctly for all users)...")
try:
    response = supabase.auth.admin.list_users()
    for user in response.users:
        print(f"ID: {user.id} | Email: {user.email} | Metadata: {user.user_metadata}")
except Exception as e:
    print(f"Error listing users (you might not be using service role key, using anon key): {e}")

    # Fallback: Query the public.users table just in case they are synced
    print("\nFallback: Fetching from public.users table")
    result = supabase.table("users").select("*").execute()
    for user in result.data:
        print(user)
