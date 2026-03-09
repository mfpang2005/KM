import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    exit(1)

supabase = create_client(url, key)

def check_orders():
    try:
        # Check total count
        res = supabase.table("orders").select("id", count="exact").execute()
        count = res.count if hasattr(res, 'count') else len(res.data)
        print(f"Total orders in 'orders' table: {count}")
        
        # Check recent orders (last 60 days)
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        window_start = (now - timedelta(days=60)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        res_recent = supabase.table("orders").select("id").gte("created_at", window_start).execute()
        print(f"Orders created in last 60 days: {len(res_recent.data)}")
        
        if res.data:
            print("\nSample order details:")
            res_sample = supabase.table("orders").select("*").limit(1).execute()
            if res_sample.data:
                sample = res_sample.data[0]
                for k, v in sample.items():
                    print(f"  {k}: {v}")
        else:
            print("No orders found at all.")
            
    except Exception as e:
        print(f"Error checking orders: {e}")

if __name__ == "__main__":
    check_orders()
