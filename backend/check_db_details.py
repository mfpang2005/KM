import os
import httpx
from dotenv import load_dotenv
import sys
import io

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

def check_table_details():
    # Check RLS status and default ID via a new insert
    url = f"{SUPABASE_URL}/rest/v1/vehicles"
    test_data = {
        "plate_no": "CHECK-RLS-001",
        "status": "available"
    }
    
    print("--- Checking Table with Service Role Key ---")
    try:
        response = httpx.post(url, json=test_data, headers=HEADERS)
        print(f"Service Role Insert Status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error: {response.text}")
        else:
            print("SUCCESS: Service Role can insert.")
            # Delete it now
            httpx.delete(f"{url}?plate_no=eq.CHECK-RLS-001", headers=HEADERS)
    except Exception as e:
        print(f"Request Error: {str(e)}")

    # Check date format
    print("\n--- Checking Date Column Format (if possible) ---")
    test_data_date = {
        "plate_no": "CHECK-DATE-001",
        "road_tax_expiry": "2026-12-31" # Standard ISO date
    }
    try:
        response = httpx.post(url, json=test_data_date, headers=HEADERS)
        print(f"Date Insert Status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Date Error Detail: {response.text}")
        else:
            print("SUCCESS: ISO date format accepted.")
            httpx.delete(f"{url}?plate_no=eq.CHECK-DATE-001", headers=HEADERS)
    except Exception as e:
        print(f"Request Error: {str(e)}")

if __name__ == "__main__":
    check_table_details()
