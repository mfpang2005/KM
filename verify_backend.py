import requests
import json

def check_backend():
    url = "http://127.0.0.1:8000/orders/finance-summary"
    try:
        response = requests.get(url, timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except Exception as e:
        print(f"Error connecting to backend: {e}")

if __name__ == "__main__":
    check_backend()
