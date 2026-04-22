import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

def check_orders():
    # Fetch recent orders to see the ID format
    response = supabase.table("orders").select("id, status").limit(5).execute()
    print("Recent orders:")
    for order in response.data:
        print(f"ID: '{order['id']}', Status: {order['status']}")

    # Try to find the specific order from the screenshot
    target_id = "KM-26/03/25/004"
    res = supabase.table("orders").select("*").eq("id", target_id).execute()
    if res.data:
        print(f"\nFound target order: {res.data[0]['id']}")
    else:
        print(f"\nCould NOT find order with ID: {target_id}")
        # Try finding by partial match
        res2 = supabase.table("orders").select("id").ilike("id", "%004%").execute()
        print(f"Partial matches for '004': {[o['id'] for o in res2.data]}")

if __name__ == "__main__":
    check_orders()
