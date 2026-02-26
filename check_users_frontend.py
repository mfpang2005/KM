import os
from supabase import create_client, Client

url: str = "https://wryhvvakeysdbktvemzo.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzY2NDAsImV4cCI6MjA4NzIxMjY0MH0.r4Io7xE4DuOzaHGQoJ21_d-pb_J5_JIDBDplvfKiGsY"

supabase: Client = create_client(url, key)

print("Fetching from public.users table in frontend Supabase instance...")
try:
    result = supabase.table("users").select("*").execute()
    for user in result.data:
        print(user)
except Exception as e:
    print(f"Error: {e}")
