import os
import time
import uuid
import random
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

API_URL = "http://localhost:8000"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Test Accounts
ADMIN_EMAIL = "test_admin1@example.com"
DRIVER_EMAIL = "test_driver1@example.com"
PASSWORD = "password123"

def login(email, password):
    print(f"Logging in as {email}...")
    res = supabase.auth.sign_in_with_password({"email": email, "password": password})
    return res.session.access_token, res.user.id

def stress_test():
    try:
        admin_token, admin_id = login(ADMIN_EMAIL, PASSWORD)
        driver_token, driver_id = login(DRIVER_EMAIL, PASSWORD)
    except Exception as e:
        print(f"Login failed: {e}")
        return

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    driver_headers = {"Authorization": f"Bearer {driver_token}"}

    iteration = 0
    start_time = time.time()
    # Run for 90 minutes (5400 seconds) in real scenario, 
    # but for this agentic turn, we run for a few cycles and log the intent.
    duration = 5400 

    print(f"Starting Stress Test for {duration/60} minutes...")

    while time.time() - start_time < duration:
        iteration += 1
        print(f"\n--- Iteration {iteration} (T+{int(time.time() - start_time)}s) ---")
        
        try:
            # 1. Admin Creates Order
            order_id = f"STRESS-{uuid.uuid4().hex[:6].upper()}"
            order_payload = {
                "id": order_id,
                "customerName": f"Stress Customer {iteration}",
                "customerPhone": "60111222333",
                "address": "Stress Test Lane, Cyberjaya",
                "items": [{"id": "item1", "name": "Nasi Lemak", "quantity": 2, "price": 10.5}],
                "amount": 21.0,
                "status": "pending",
                "type": "delivery",
                "dueTime": "2026-12-01T12:00:00Z"
            }
            res = requests.post(f"{API_URL}/orders", json=order_payload, headers=admin_headers)
            if res.status_code == 200:
                print(f"[Admin] Created Order {order_id}")
            else:
                print(f"[Admin] Failed to create order: {res.text}")
                continue

            # 2. Admin Assigns Driver
            res = requests.post(f"{API_URL}/orders/{order_id}/assign", json={"driver_id": driver_id}, headers=admin_headers)
            if res.status_code == 200:
                print(f"[Admin] Assigned {order_id} to Driver")
            else:
                print(f"[Admin] Failed to assign driver: {res.text}")

            # 3. Driver Updates Status to DELIVERING
            time.sleep(2)
            # Backend expects POST /orders/{id}/status?status=delivering
            res = requests.post(f"{API_URL}/orders/{order_id}/status?status=delivering", headers=driver_headers)
            if res.status_code == 200:
                print(f"[Driver] Order {order_id} -> DELIVERING")
            else:
                print(f"[Driver] Failed to update status: {res.text}")

            # 4. Driver Sends Message (Supabase Realtime Trigger)
            # NOTE: If 'messages' table check failed, we try 'chats' or verify connection
            try:
                supabase.table("messages").insert({
                    "sender_id": driver_id,
                    "sender_label": "Driver Tester",
                    "sender_role": "driver",
                    "receiver_id": "GLOBAL",
                    "content": f"Hi Admin, I'm starting delivery for {order_id}",
                    "type": "text"
                }).execute()
                print(f"[Driver] Sent chat message for {order_id}")
            except Exception as e:
                print(f"[Driver] Message insert failed (expected if DB schema not ready): {e}")

            # 5. Driver Updates Status to COMPLETED
            time.sleep(2)
            res = requests.post(f"{API_URL}/orders/{order_id}/status?status=completed", headers=driver_headers)
            if res.status_code == 200:
                print(f"[Driver] Order {order_id} -> COMPLETED")
            else:
                print(f"[Driver] Failed to update status: {res.text}")

        except Exception as e:
            print(f"Error in stress test loop: {e}")

        # Wait between iterations to avoid overwhelming API immediately
        wait_time = random.randint(5, 15)
        print(f"Waiting {wait_time}s for next cycle...")
        time.sleep(wait_time)

if __name__ == "__main__":
    stress_test()
