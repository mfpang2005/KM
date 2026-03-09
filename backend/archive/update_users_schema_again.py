from database import supabase

queries = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_model text;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_plate text;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_type text;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_status text DEFAULT 'idle';"
]

for query in queries:
    print(f'Running: {query}')
    res = supabase.rpc('run_sql', {'query': query}).execute()
    print(res)
