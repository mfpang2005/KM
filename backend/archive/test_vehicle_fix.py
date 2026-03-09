import httpx
import uuid
import sys
import io

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def test_duplicate_vehicle():
    plate_no = f"DUP-{uuid.uuid4().hex[:4].upper()}"
    vehicle_data = {
        "plate_no": plate_no,
        "model": "Test Model",
        "type": "Van",
        "status": "available"
    }

    print(f"Testing duplicate vehicle detection for: {plate_no}")

    # 1. First insertion
    with httpx.Client(base_url=BASE_URL) as client:
        print("Inserting first time...")
        r1 = client.post("/vehicles/", json=vehicle_data)
        print(f"First insert status: {r1.status_code}")
        
        # 2. Second insertion (duplicate)
        print("Inserting second time (duplicate)...")
        r2 = client.post("/vehicles/", json=vehicle_data)
        print(f"Second insert status: {r2.status_code}")
        print(f"Second insert response: {r2.text}")

        if r2.status_code == 400 and "已存在" in r2.text:
            print("SUCCESS: Duplicate vehicle correctly identified and handled.")
        else:
            print("FAILURE: Duplicate vehicle not handled as expected.")

if __name__ == "__main__":
    test_duplicate_vehicle()
