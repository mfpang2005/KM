import os
from supabase import create_client
from dotenv import load_dotenv

def apply_migration():
    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
        return

    supabase = create_client(url, key)
    
    with open("migration_order_items.sql", "r") as f:
        sql = f.read()
    
    print("Applying migration...")
    try:
        # Note: This requires the 'run_sql' RPC to be defined in Supabase
        # as seen in previous attempts or standard setups.
        # If not, the user must run it manually.
        response = supabase.rpc("run_sql", {"sql": sql}).execute()
        print("Migration applied successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
        print("\nIMPORTANT: Please run the SQL in backend/migration_order_items.sql manually in the Supabase SQL Editor.")

if __name__ == "__main__":
    apply_migration()
