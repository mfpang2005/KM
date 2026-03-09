import os
from supabase import create_client
from dotenv import load_dotenv
from pydantic import ValidationError
import sys

# Add current directory to path so we can import models
sys.path.append(os.getcwd())
from models import Order

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

def validate_db_orders():
    print("Fetching all orders for validation...")
    res = supabase.table("orders").select("*").execute()
    orders_data = res.data or []
    print(f"Total orders fetched: {len(orders_data)}")
    
    invalid_count = 0
    for data in orders_data:
        try:
            # Try to parse into the Order model
            Order(**data)
        except ValidationError as e:
            invalid_count += 1
            print(f"\n[INVALID] Order ID: {data.get('id')}")
            print(f"  Error: {e}")
            # print(f"  Data: {data}")
        except Exception as e:
            invalid_count += 1
            print(f"\n[ERROR] Order ID: {data.get('id')}")
            print(f"  Exception: {e}")
            
    if invalid_count == 0:
        print("\nAll orders valid according to Pydantic model.")
    else:
        print(f"\nFound {invalid_count} invalid orders out of {len(orders_data)}.")

if __name__ == "__main__":
    validate_db_orders()
