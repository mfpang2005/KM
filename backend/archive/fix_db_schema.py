from database import supabase

def fix_schema():
    queries = [
        # 1. Drop existing check constraint if it exists (usually users_role_check)
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;",
        
        # 2. Add new check constraint with super_admin
        "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kitchen', 'driver', 'super_admin'));",
        
        # 3. Ensure other columns exist (from previous attempts)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;"
    ]

    for q in queries:
        print(f"Executing: {q}")
        try:
            res = supabase.rpc('run_sql', {'query': q}).execute()
            print(f"Result: {res}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    fix_schema()
