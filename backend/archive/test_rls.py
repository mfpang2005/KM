import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

def check_policies():
    # We can use the /rest/v1/rpc/raw_sql if the user has a tool for it, 
    # but since they don't, I will try to use the setup_vehicles.py logic to just RE-APPLY a more robust policy.
    # Actually, I'll try to check if I can insert as a NON-SERVICE role user (anon or authenticated).
    
    # Get anon key from .env
    with open("c:/Users/User/Downloads/kim-long-smart-catering-system/admin-web/.env.local", "r") as f:
        lines = f.readlines()
        anon_key = ""
        for line in lines:
            if "VITE_SUPABASE_ANON_KEY" in line:
                anon_key = line.split("=")[1].strip()
    
    if not anon_key:
        print("Could not find anon key.")
        return

    ANON_HEADERS = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }

    url = f"{SUPABASE_URL}/rest/v1/vehicles"
    test_data = {
        "plate_no": "TEST-ANON-AUTH-001",
        "status": "available"
    }
    
    print("--- Testing Insert with ANON Key ---")
    try:
        response = httpx.post(url, json=test_data, headers=ANON_HEADERS)
        print(f"Anon Insert Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    check_policies()
