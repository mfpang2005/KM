import os
import httpx
from dotenv import load_dotenv
import uuid

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def reproduce_save_failure():
    url = f"{SUPABASE_URL}/rest/v1/vehicles"
    
    # 模拟前端发送的数据，不带 ID
    test_data = {
        "plate_no": f"TEST-{uuid.uuid4().hex[:4].upper()}",
        "model": "Test Model",
        "type": "Van",
        "status": "available"
    }
    
    print(f"Attempting to insert: {test_data}")
    
    try:
        response = httpx.post(url, json=test_data, headers=HEADERS)
        print(f"Status Code: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error Detail: {response.text}")
        else:
            print("Successfully inserted (direct REST)")
            
    except Exception as e:
        print(f"Request Error: {str(e)}")

if __name__ == "__main__":
    reproduce_save_failure()
