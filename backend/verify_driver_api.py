import httpx
import asyncio
import uuid

BASE_URL = "http://localhost:8000"

async def verify_driver_creation():
    test_email = f"test_driver_{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": test_email,
        "password": "TestPassword123!",
        "role": "driver",
        "name": "Test Driver",
        "employee_id": "TEST001"
    }
    
    print(f"Testing driver creation with email: {test_email}")
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        try:
            # We need admin privileges, but for a smoke test we'll see if we can at least reach it
            # or if it returns 401/403 (which means the endpoint exists and is protected)
            response = await client.post("/admin/users/", json=payload)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print("SUCCESS: Endpoint reached and user created!")
            elif response.status_code in [401, 403]:
                print("Endpoint exists but requires authentication (expected).")
            else:
                print(f"FAILED: Unexpected status code {response.status_code}")
                
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(verify_driver_creation())
