import httpx
import uuid
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def test_empty_string_fix():
    plate_no = f"EMPTY-FIX-{uuid.uuid4().hex[:4].upper()}"
    # Simulate frontend sending empty strings for optional fields
    vehicle_data = {
        "plate_no": plate_no,
        "model": "Test Empty Fix",
        "type": "Van",
        "status": "available",
        "road_tax_expiry": "",
        "capacity": ""
    }

    print(f"Testing empty string fix for: {plate_no}")

    with httpx.Client(base_url=BASE_URL) as client:
        response = client.post("/vehicles/", json=vehicle_data)
        print(f"Insert status: {response.status_code}")
        if response.status_code == 200:
            print("SUCCESS: Backend correctly handled empty strings and saved the vehicle.")
            data = response.json()
            print(f"Saved Data: road_tax_expiry={data.get('road_tax_expiry')}, capacity={data.get('capacity')}")
        else:
            print(f"FAILURE: {response.text}")

if __name__ == "__main__":
    test_empty_string_fix()
