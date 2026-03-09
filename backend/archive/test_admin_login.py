import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

def test_login():
    email = "acc.kimlonggroup@gmail.com"
    password = "password123"
    
    print(f"Testing login for: {email}")
    
    # 1. Get Token from Supabase Auth
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    auth_headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    auth_data = {
        "email": email,
        "password": password
    }
    
    try:
        response = httpx.post(auth_url, json=auth_data, headers=auth_headers)
        if response.status_code != 200:
            print(f"Auth failed: {response.status_code} - {response.text}")
            return
        
        token_info = response.json()
        access_token = token_info.get("access_token")
        print("Auth success: Token retrieved.")
        
        # 2. Test Super Admin API
        backend_url = "http://127.0.0.1:8000/super-admin/stats"
        backend_headers = {
            "Authorization": f"Bearer {access_token}"
        }
        
        api_response = httpx.get(backend_url, headers=backend_headers)
        print(f"API stats response: {api_response.status_code}")
        if api_response.status_code == 200:
            print(f"API success: {api_response.json()}")
        else:
            print(f"API failed: {api_response.text}")
            
    except Exception as e:
        print(f"Error during test: {str(e)}")

if __name__ == "__main__":
    test_login()
