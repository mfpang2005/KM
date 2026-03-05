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

def test_empty_fields():
    url = f"{SUPABASE_URL}/rest/v1/vehicles"
    # Testing road_tax_expiry as empty string and capacity as empty string
    test_data = {
        "plate_no": "TEST-EMPTY-001",
        "road_tax_expiry": "",
        "capacity": None # Pydantic might send None or omit
    }
    
    print("--- Testing Insert with Empty String Date ---")
    try:
        response = httpx.post(url, json=test_data, headers=HEADERS)
        print(f"Empty String Date Status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

    # Testing capacity as empty string
    test_data_cap = {
        "plate_no": "TEST-EMPTY-002",
        "capacity": "" # Some frontends might send "" for numbers
    }
    print("\n--- Testing Insert with Empty String Capacity ---")
    try:
        response = httpx.post(url, json=test_data_cap, headers=HEADERS)
        print(f"Empty String Capacity Status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    test_empty_fields()
