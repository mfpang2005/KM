import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

tables_to_check = ["orders", "order_items", "products", "users", "recipes", "system_config"]

def check_tables():
    for table in tables_to_check:
        try:
            res = supabase.table(table).select("id").limit(1).execute()
            print(f"Table '{table}': EXISTS")
        except Exception as e:
            if "does not exist" in str(e) or "PGRST204" in str(e) or "404" in str(e):
                print(f"Table '{table}': MISSING")
            else:
                print(f"Table '{table}': ERROR ({e})")

if __name__ == "__main__":
    check_tables()
