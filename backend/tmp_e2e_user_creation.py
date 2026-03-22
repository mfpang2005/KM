import os
import requests
from dotenv import load_dotenv
import jwt
import datetime

load_dotenv()

# Backend configuration
backend_url = "http://localhost:8000/admin/users/"
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY") # This is typically the service role key

print(f"--- Debugging User Creation Endpoint ---")
print(f"Backend URL: {backend_url}")

# 1. Create a "Fake" Super Admin Token
# We need this because require_admin depends on it.
# In a real scenario, we'd use a real token, but for local debug, 
# let's see if we can use the X-User-Id / X-User-Role bypass in auth.py
headers = {
    "X-User-Id": "00000000-0000-0000-0000-000000000000",
    "X-User-Role": "super_admin",
    "Content-Type": "application/json"
}

payload = {
    "email": "debug_test_100@km.com",
    "password": "password123",
    "name": "Debug User 100",
    "role": "driver",
    "phone": "99999999"
}

print(f"\nSending POST request to {backend_url}...")
try:
    response = requests.post(backend_url, json=payload, headers=headers, timeout=10)
    print(f"Response Status: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")

# 2. Check Supabase Auth directly (sanity check)
print(f"\n--- Checking Supabase Auth Directly ---")
from supabase import create_client
try:
    supabase = create_client(supabase_url, supabase_key)
    # Check if user was created despite the "failed" response
    res = supabase.table("users").select("*").eq("email", "debug_test_100@km.com").execute()
    print(f"Users found in DB: {res.data}")
except Exception as e:
    print(f"Supabase Direct Check Failed: {e}")
