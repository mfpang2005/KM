import httpx
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

def get_token():
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    auth_data = {"email": "acc.kimlonggroup@gmail.com", "password": "password123"}
    r = httpx.post(auth_url, json=auth_data, headers={"apikey": SUPABASE_ANON_KEY})
    return r.json().get("access_token")

def test_delete():
    token = get_token()
    if not token:
        print("Failed to get token")
        return

    # 先创建一个临时车辆
    create_url = "http://127.0.0.1:8000/vehicles/"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"plate_no": "DEL-TEST-99", "status": "available"}
    
    print("Creating test vehicle...")
    r = httpx.post(create_url, json=payload, headers=headers)
    if r.status_code != 200:
        print(f"Failed to create: {r.text}")
        return
    
    vehicle_id = r.json().get("id")
    print(f"Created vehicle ID: {vehicle_id}")

    # 尝试删除
    delete_url = f"http://127.0.0.1:8000/vehicles/{vehicle_id}"
    print(f"Attempting to delete {vehicle_id}...")
    r = httpx.delete(delete_url, headers=headers)
    
    print(f"Delete Status: {r.status_code}")
    print(f"Delete Response: {r.text}")

if __name__ == "__main__":
    test_delete()
