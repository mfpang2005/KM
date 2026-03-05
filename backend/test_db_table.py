import os
import httpx
from dotenv import load_dotenv
import sys

# Ensure UTF-8 output for Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

def test_vehicles_table():
    url = f"{SUPABASE_URL}/rest/v1/vehicles?select=count"
    try:
        response = httpx.get(url, headers=HEADERS)
        if response.status_code == 200:
            print("SUCCESS: 'vehicles' table exists.")
            return True
        else:
            print(f"FAILED: 'vehicles' table check status {response.status_code}")
            print(f"Detail: {response.text}")
            return False
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    test_vehicles_table()
