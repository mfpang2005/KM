import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
s = create_client(url, key)

email = "debug_test_100@km.com"

print(f"Cleanup for {email}...")

# 1. Delete from DB
res_db = s.table("users").delete().eq("email", email).execute()
print(f"DB Delete: {res_db}")

# 2. Delete from Auth (need ID)
res_find = s.auth.admin.list_users() # Or just search
target_user = next((u for u in res_find if u.email == email), None)

if target_user:
    print(f"Found Auth User ID: {target_user.id}. Deleting...")
    res_auth = s.auth.admin.delete_user(target_user.id)
    print(f"Auth Delete: {res_auth}")
else:
    print("Auth User not found.")
