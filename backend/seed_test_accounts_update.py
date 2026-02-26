import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

accounts = [
    {"id": "d5f96816-8f30-4ac0-b61c-857df04b8be4", "email": "test_admin1@example.com", "role": "admin", "name": "Admin Tester"},
    {"id": "81cff33d-cbb5-4ed5-b9dc-e3bf1c377232", "email": "test_kitchen1@example.com", "role": "kitchen", "name": "Kitchen Tester"},
    {"id": "6480f2ee-aa9f-490e-b53d-28dd16f7973e", "email": "test_driver1@example.com", "role": "driver", "name": "Driver Tester"}
]

for acc in accounts:
    try:
        supabase.table("users").update({
            "role": acc["role"],
            "name": acc["name"]
        }).eq("id", acc["id"]).execute()
        print(f"Updated public user role to {acc['role']}")
    except Exception as e:
        print(f"Error updating {acc['email']}: {e}")
