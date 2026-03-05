import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# We need a valid session token. I'll reuse the logic from test_admin_login.py
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

def get_token():
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    auth_data = {"email": "acc.kimlonggroup@gmail.com", "password": "password123"}
    r = httpx.post(auth_url, json=auth_data, headers={"apikey": SUPABASE_ANON_KEY})
    return r.json().get("access_token")

def test_actual_save():
    token = get_token()
    if not token:
        print("Failed to get token")
        return

    # Test case: Minimum required fields
    plate_no = "FINAL-TEST-001"
    payload = {
        "plate_no": plate_no,
        "status": "available",
        "model": "",
        "type": "",
        "road_tax_expiry": "",
        "capacity": "",
        "notes": ""
    }

    print(f"Testing save via Backend API with token for: {plate_no}")
    try:
        r = httpx.post("http://127.0.0.1:8000/vehicles/", json=payload, headers={"Authorization": f"Bearer {token}"})
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_actual_save()
