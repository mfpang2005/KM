import requests
import json
import uuid

# We don't have a token, but I can use the local server which is running.
# Wait! I can just use supabase-py locally.
from database import supabase

test_order = {
    "customerName": "API Test Customer",
    "phone": "99999999",
    "dueTime": "2026-03-21T22:00:00.000Z",
    "amount": 200.0,
    "payment_received": 0.0,
    "status": "pending",
    "items": [
        {"id": "API-1", "name": "API Dish", "quantity": 1}
    ]
}

print("Running manual sync test for NEW order...")
# Replicate the logic in create_order
try:
    # 1. Insert order
    res = supabase.table("orders").insert(test_order).execute()
    new_order = res.data[0]
    print(f"Order created: {new_order['id']}")
    
    # 2. Sync items
    items = test_order["items"]
    prep_items = []
    for item in items:
        prep_items.append({
            "order_id": new_order["id"],
            "name": item["name"],
            "quantity": item["quantity"],
            "status": "pending"
        })
    res_items = supabase.table("order_items").insert(prep_items).execute()
    print(f"Sync successful: {len(res_items.data)} items.")
    
except Exception as e:
    print(f"FAILED TO SYNC: {e}")

# Cleanup
# supabase.table("orders").delete().eq("customerName", "API Test Customer").execute()
