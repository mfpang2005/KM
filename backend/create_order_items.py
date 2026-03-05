
import os
import httpx
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")  # service role key

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

sql = """
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    is_prepared BOOLEAN DEFAULT FALSE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
"""

resp = httpx.post(
    f"{url}/rest/v1/rpc/exec_sql",
    headers=headers,
    json={"query": sql}
)
print(f"Status: {resp.status_code}")
print(f"Response: {resp.text}")

if resp.status_code not in (200, 201, 204):
    print("\nFallback: trying pg_net approach...")
    # Try direct table creation approach via management API
    mgmt_resp = httpx.post(
        f"{url}/rest/v1/",
        headers=headers,
        json={}
    )
    print(f"Note: For table creation, please run the SQL manually in Supabase Dashboard > SQL Editor:")
    print(sql)
