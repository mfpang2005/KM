
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

# Add is_prepared column using the REST API via update
# Since we can't run raw SQL via anon key, we use the admin endpoint
try:
    # Simply try to update a dummy item with is_prepared to check if column exists
    check = supabase.table("order_items").select("is_prepared").limit(1).execute()
    print("Column 'is_prepared' already exists!")
except Exception as e:
    if "column" in str(e).lower() or "does not exist" in str(e).lower():
        print("Column does not exist yet. Please run this SQL in Supabase Dashboard:")
        print("""
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN DEFAULT FALSE;

UPDATE public.order_items SET is_prepared = TRUE WHERE status = 'ready';
        """)
    else:
        print(f"Check result: {e}")
        
# If successful, print the schema
result = supabase.table("order_items").select("*").limit(3).execute()
print(f"Sample order_items data: {result.data}")
