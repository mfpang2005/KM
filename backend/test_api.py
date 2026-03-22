import requests
import json
import sys

# Get user token using the auth bypass header
headers = {
    "x-user-id": "123", # any id
    "x-user-role": "admin"
}
try:
    res = requests.get("http://localhost:8000/super-admin/financials?range=month", headers=headers)
    print(f"Status Code: {res.status_code}")
    print(json.dumps(res.json(), indent=2))
except Exception as e:
    print(e)
