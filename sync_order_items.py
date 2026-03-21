import os
import sys
import uuid
sys.path.append(os.path.join(os.getcwd(),'backend'))
from database import supabase

def sync_existing():
    print("Fetching orders...")
    res = supabase.table("orders").select("id, items").execute()
    orders = res.data or []
    print(f"Found {len(orders)} orders.")
    
    total_added = 0
    for order in orders:
        order_id = order['id']
        items = order.get('items', [])
        if not items:
            continue
            
        print(f"Processing Order {order_id}...")
        
        # Check if already has items in order_items
        check = supabase.table("order_items").select("id").eq("order_id", order_id).execute()
        if check.data:
            print(f"Order {order_id} already has {len(check.data)} items in order_items table. Skipping.")
            continue
            
        prep_items = []
        for item in items:
            # We want to be careful: if item['id'] is already a UUID (unlikely from check_ids.py), we could use it? 
            # No, let's let postgres generate one, or generate one ourselves.
            prep_items.append({
                "order_id": order_id,
                "product_id": item.get('id'), # The KL-xxxx product ID
                "name": item.get('name', 'Unnamed Dish'),
                "quantity": item.get('quantity', 1),
                "price": item.get('price', 0),
                "is_prepared": False,
                "status": "pending"
            })
            
        if prep_items:
            print(f"Inserting {len(prep_items)} items for {order_id}...")
            try:
                res_ins = supabase.table("order_items").insert(prep_items).execute()
                if res_ins.data:
                    total_added += len(res_ins.data)
                else:
                    print(f"Insert produced no data for {order_id}")
            except Exception as e:
                print(f"Failed to insert for {order_id}: {e}")
                
    print(f"\nDone! Added {total_added} items to order_items table.")

if __name__ == "__main__":
    sync_existing()
