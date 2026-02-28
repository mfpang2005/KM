import requests
import json

BASE_URL = "http://localhost:8000"

def test_create_staff():
    print("--- Testing Staff Account Creation ---")
    
    # We need a super admin token, or we can bypass if we have access to DB
    # For now, let's assume the backend allows creation if we send a mock admin header or something
    # Actually, I'll just check if the model is correct first by calling the endpoint with invalid data
    
    payload = {
        "email": "test_driver_smoke@kimlong.com",
        "password": "password123",
        "role": "driver",
        "name": "Smoke Test Driver",
        "employee_id": "SMOKE-001"
    }
    
    # Note: This will likely fail with 401 if require_admin is strict
    try:
        response = requests.post(f"{BASE_URL}/admin/users/", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error connecting to backend: {e}")

if __name__ == "__main__":
    test_create_staff()
