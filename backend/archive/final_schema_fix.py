import os
import httpx
from dotenv import load_dotenv

# Load from backend folder
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv('SUPABASE_URL')
SERVICE_ROLE_KEY = os.getenv('SUPABASE_KEY')

HEADERS = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

def execute_sql(sql_query: str):
    # Try using RPC first if it exists, otherwise we might be stuck without SQL access
    # Since run_sql failed, let's try to notify the user if we can't find another way.
    # Actually, Supabase doesn't expose a /rest/v1/sql endpoint by default.
    # The /rest/v1/sql mentioned in add_columns_rest.py is likely a mistake or a custom proxy.
    
    # Let's try to use the RPC run_sql anyway in case I made a typo or it's in a different schema.
    url = f'{SUPABASE_URL}/rest/v1/rpc/run_sql'
    print(f'Attempting to execute SQL via RPC: {url}')
    try:
        response = httpx.post(url, json={'query': sql_query}, headers=HEADERS)
        if response.status_code in [200, 201, 204]:
            print('Success!')
            return True
        else:
            print(f'Failed: {response.status_code} - {response.text}')
            return False
    except Exception as e:
        print(f'Error: {e}')
        return False

# Since I found audit_logs missing and users columns missing, I will try to fix them.
# If RPC fails, I might have to ask the user to run the SQL in Supabase Dashboard.

sql_fix = """
-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add missing columns to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_status TEXT DEFAULT 'idle';

-- 3. Update role check constraint
-- First drop the old one (name found from diagnostic script: users_role_check)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kitchen', 'driver', 'super_admin'));
"""

if __name__ == "__main__":
    if not execute_sql(sql_fix):
        print("\nCRITICAL: Failed to apply SQL changes via API.")
        print("Please run the following SQL manually in your Supabase SQL Editor:")
        print("-" * 20)
        print(sql_fix)
        print("-" * 20)
