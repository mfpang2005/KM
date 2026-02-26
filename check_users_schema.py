import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv("backend/.env")
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(url, key)

try:
    result = supabase.table("users").select("*").limit(1).execute()
    if result.data:
        print("Columns in public.users:")
        for k in result.data[0].keys():
            print(k)
    else:
        print("No users found to inspect schema.")
except Exception as e:
    print(f"Error: {e}")
