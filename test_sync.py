import os
import sys
sys.path.append(os.path.join(os.getcwd(),'backend'))
from database import supabase

test_order = {
    "customerName": "Test Customer",
    "phone": "12345678",
    "dueTime": "2026-03-21T21:00:00.000Z",
    "amount": 100.0,
    "payment_received": 0.0,
    "status": "pending",
    "items": [
        {"id": "KL-TEST1", "name": "Test Item 1", "quantity": 1, "price": 50.0},
        {"id": "KL-TEST2", "name": "Test Item 2", "quantity": 2, "price": 25.0}
    ]
}

# 1. Clear test data if any
# supabase.table("orders").delete().eq("customerName", "Test Customer").execute()

# 2. Replicate the logic from orders.py (Simplified)
# Usually we'd use the actual API, but I want to trace why it might be failing.

try:
    print("Inserting order...")
    res = supabase.table("orders").insert(test_order).execute()
    new_order = res.data[0]
    print(f"Created Order: {new_order['id']}")
    
    prep_items = []
    for item in test_order["items"]:
        prep_items.append({
            "order_id": new_order["id"],
            "name": item["name"],
            "product_id": item["id"],  # Let's see if we should map this
            "quantity": item["quantity"],
            "status": "pending",
            "price": item.get("price", 0)
        })
    
    print(f"Inserting {len(prep_items)} order items...")
    res_items = supabase.table("order_items").insert(prep_items).execute()
    print(f"Order items successfully synced: {len(res_items.data)}")

except Exception as e:
    print(f"FAILED: {e}")
