import httpx
import os
import sys
import asyncio
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")
API_BASE_URL = "http://localhost:8000"

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("❌ Cannot find SUPABASE_URL or SUPABASE_KEY in .env")
    sys.exit(1)

# To interact with Supabase Realtime from Python, we typically rely on community libraries.
# For a REST-focused smoke test simulating the system:

async def test_create_order(client: httpx.AsyncClient):
    print("[WAIT] Testing: Create Order API")
    url = f"{API_BASE_URL}/orders"
    payload = {
        "customerName": "Smoke Test Customer",
        "customerPhone": "0123456789",
        "address": "123 Smoke Test St",
        "type": "delivery",
        "paymentMethod": "cash",
        "eventDate": "2026-12-31",
        "eventTime": "12:00",
        "dueTime": "12:00",
        "items": [],
        "equipments": {"spoon": 5},
        "amount": 100.0,
        "status": "pending"
    }
    
    try:
        resp = await client.post(url, json=payload)
        if resp.status_code in [200, 201]:
            print(f"[OK] Order Created Successfully (Status: {resp.status_code})")
            order_id = resp.json().get('id')
            return order_id
        else:
            print(f"[FAIL] Order Creation Failed: {resp.status_code}")
            print(resp.text)
            return None
    except Exception as e:
        print(f"[FAIL] Exception in create order: {e}")
        return None

async def test_assign_driver(client: httpx.AsyncClient):
    print(f"[WAIT] Testing: Assign Vehicle API")
    url = f"{API_BASE_URL}/vehicles/assign"
    
    # Needs valid driver and vehicle IDs to not 500 DB FK constraints
    from database import supabase
    v_res = supabase.table("vehicles").select("id").limit(1).execute()
    u_res = supabase.table("users").select("id").eq("role", "driver").limit(1).execute()
    
    if not v_res.data or not u_res.data:
        print("[SKIP] Skipping Vehicle Assign test - missing driver or vehicle in DB")
        return
        
    payload = {"driver_id": u_res.data[0]["id"], "vehicle_id": v_res.data[0]["id"]}
    
    try:
        resp = await client.post(url, json=payload)
        if resp.status_code in [200, 201]:
            print(f"[OK] Driver Assigned Successfully")
        else:
            print(f"[FAIL] Driver Assignment Failed or Missing Endpoint: {resp.status_code}")
            print(resp.text)
    except Exception as e:
        print(f"[FAIL] Exception in assign driver: {e}")

async def test_admin_approve_user(client: httpx.AsyncClient):
    print("[SKIP] Testing: Admin Get Users API (Requires full SuperAdmin Login Token, skipping in simple smoke test)")
    # url = f"{API_BASE_URL}/super-admin/users"
    # headers = {
    #     "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
    # }
    # async with httpx.AsyncClient() as client:
    #     try:
    #         resp = await client.get(url, headers=headers)
    #         if resp.status_code == 200:
    #             print(f"[OK] Fetch Users Successful")
    #         else:
    #             print(f"[FAIL] Fetch Users Failed: {resp.status_code}")
    #             print(resp.text)
    #     except Exception as e:
    #         print(f"[FAIL] Exception in fetch users: {e}")

async def run_smoke_test():
    print("==================================")
    print(">>> Running Full System Smoke Test")
    print("==================================")
    
    async with httpx.AsyncClient() as client:
        order_id = await test_create_order(client)
        await test_assign_driver(client)
        await test_admin_approve_user(client)
    
    print("\n==================================")
    print(">>> Smoke Test Request Completed")
    print("NOTE: Realtime events (Walkie-Talkie & DB Channels) are active.")
    print("Please verify the app UI updates if browsers are open.")
    print("==================================")

if __name__ == "__main__":
    asyncio.run(run_smoke_test())
