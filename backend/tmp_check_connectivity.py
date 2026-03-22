import os
import requests
from dotenv import load_dotenv

load_dotenv()

# Test the actual backend endpoint
url = "http://localhost:8000/admin/users/"
# We need a valid admin token. 
# For debug, let's just check if 8000 is UP and responding at all.
try:
    r = requests.get("http://localhost:8000/health", timeout=5)
    print(f"Backend Health: {r.status_code} - {r.text}")
except Exception as e:
    print(f"Backend connectivity error: {e}")

# Check Supabase again
from supabase import create_client
s_url = os.getenv("SUPABASE_URL")
s_key = os.getenv("SUPABASE_KEY")
print(f"Supabase Connection Test: {s_url}")
try:
    supabase = create_client(s_url, s_key)
    # Try a simple fetch
    res = supabase.table("users").select("id").limit(1).execute()
    print(f"Supabase Select Success: {len(res.data)} rows")
except Exception as e:
    print(f"Supabase error: {e}")
