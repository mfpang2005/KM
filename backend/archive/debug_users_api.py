import os
import httpx
from dotenv import load_dotenv

load_dotenv("backend/.env")

SUPABASE_URL = os.getenv('SUPABASE_URL')
SERVICE_ROLE_KEY = os.getenv('SUPABASE_KEY')

ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzY2NDAsImV4cCI6MjA4NzIxMjY0MH0.r4Io7xE4DuOzaHGQoJ21_d-pb_J5_JIDBDplvfKiGsY"

HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
}

def check_users():
    # Simulate the query the frontend is doing: select=role&id=eq.SOME_ID
    # But since we don't have a session, let's just try to select all.
    url = f"{SUPABASE_URL}/rest/v1/users?select=role"
    print(f"Checking URL: {url}")
    try:
        response = httpx.get(url, headers=HEADERS)
        print(f"Status: {response.status_code}")
        print(f"Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_users()
