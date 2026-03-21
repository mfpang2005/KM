import os
import sys
sys.path.append(os.path.join(os.getcwd(),'backend'))
from database import supabase

import uuid
from datetime import datetime
today_str = datetime.now().strftime("%y/%m/%d")
test_id = f"KM-{today_str}/TEST-{uuid.uuid4().hex[:6]}"

test_order = {
    "id": test_id,
    "customerName": "API Test Customer 2",
    "dueTime": "2026-03-21T23:00:00.000Z",
    "amount": 300.0,
    "payment_received": 0.0,
    "status": "pending",
    "items": [
        {"name": "API Dish 2", "quantity": 1}
    ]
}

print("Running sync test with minimal order...")
try:
    # 1. Insert order
    res = supabase.table("orders").insert(test_order).execute()
    new_order = res.data[0]
    print(f"Order created: {new_order['id']}")
    
    # 2. Sync items
    items = test_order.get("items", [])
    prep_items = []
    for item in items:
        prep_items.append({
            "order_id": new_order["id"],
            "name": item["name"],
            "quantity": item["quantity"],
            "status": "pending"
        })
    print(f"Inserting into order_items: {prep_items}")
    res_items = supabase.table("order_items").insert(prep_items).execute()
    print(f"Sync successful: {len(res_items.data)} items.")
    
except Exception as e:
    print(f"FAILED: {e}")
