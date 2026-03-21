import os
from dotenv import load_dotenv
from supabase import create_client
from pydantic import ValidationError
from models import Order

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

def debug_orders():
    print("Fetching row data from 'orders' table...")
    response = supabase.table("orders").select("*").execute()
    data = response.data
    print(f"Total rows fetched: {len(data)}")
    
    for idx, row in enumerate(data):
        try:
            Order(**row)
        except ValidationError as e:
            print(f"\n[!] VALIDATION ERROR in row {idx} (ID: {row.get('id')}):")
            print(e)
            print("Row data:", row)
        except Exception as e:
            print(f"\n[!] UNEXPECTED ERROR in row {idx}: {e}")

if __name__ == "__main__":
    debug_orders()
