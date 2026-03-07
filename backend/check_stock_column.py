import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

try:
    print("Adding 'stock' column to 'products' table...")
    # Using raw SQL via supabase is tricky if not enabled, let's try a simple RPC or just check if we can do an update that fails if column missing
    # Actually, the best way is to use a migration script that the user can run or I can run via psql if available.
    # Since I don't have direct psql, I'll try to use a service role to alter table if possible, but standard supabase-py doesn't support ALTER TABLE directly.
    # I'll assume for now the user might need to run a SQL snippet.
    
    # Let's try to fetch a record and see if stock exists
    res = supabase.table("products").select("stock").limit(1).execute()
    print("Column 'stock' already exists.")
except Exception as e:
    print(f"Error checking column: {e}")
    print("You may need to run this SQL in Supabase Dashboard:")
    print("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;")
