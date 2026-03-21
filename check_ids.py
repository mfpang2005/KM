import os
import sys
sys.path.append(os.path.join(os.getcwd(),'backend'))
from database import supabase

res = supabase.table("order_items").select("*").limit(5).execute()
print("Order Items:")
print(res.data)

res = supabase.table("orders").select("id, items").limit(2).execute()
print("\nOrders:")
print(res.data)
