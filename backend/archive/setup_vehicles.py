import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

def execute_sql(sql_query: str):
    url = f"{SUPABASE_URL}/rest/v1/sql"
    response = httpx.post(url, json={"query": sql_query}, headers=HEADERS)
    if response.status_code in [200, 201]:
        print("✅ SQL Executed successfully")
        return True
    else:
        print(f"❌ SQL Execution Failed: {response.status_code} - {response.text}")
        return False

def setup_vehicle_tables():
    sql = """
    -- Create vehicles table
    CREATE TABLE IF NOT EXISTS vehicles (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        plate_no TEXT UNIQUE NOT NULL,
        model TEXT,
        type TEXT,
        status TEXT CHECK (status IN ('available', 'busy', 'repair')) DEFAULT 'available',
        road_tax_expiry DATE,
        capacity NUMERIC,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- Create driver_assignments table
    CREATE TABLE IF NOT EXISTS driver_assignments (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
        returned_at TIMESTAMP WITH TIME ZONE,
        status TEXT CHECK (status IN ('active', 'completed')) DEFAULT 'active'
    );

    -- Enable RLS
    ALTER TABLE IF EXISTS vehicles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS driver_assignments ENABLE ROW LEVEL SECURITY;

    -- Create Policies
    DROP POLICY IF EXISTS "Public vehicles access" ON vehicles;
    CREATE POLICY "Public vehicles access" ON vehicles FOR ALL USING (true);

    DROP POLICY IF EXISTS "Public assignments access" ON driver_assignments;
    CREATE POLICY "Public assignments access" ON driver_assignments FOR ALL USING (true);
    """
    return execute_sql(sql)

if __name__ == "__main__":
    setup_vehicle_tables()
