from database import supabase

def update_schema():
    queries = [
        # 1. Update role check constraint to include 'account'
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;",
        "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kitchen', 'driver', 'super_admin', 'account'));",
        
        # 2. Add missing columns
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS position text;",
        
        # 3. Ensure employee_id exists (just in case)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;"
    ]

    print("--- Starting Database Schema Update ---")
    for q in queries:
        print(f"Executing: {q}")
        try:
            # We use the 'run_sql' RPC which is commonly set up in Supabase projects for migrations
            res = supabase.rpc('run_sql', {'query': q}).execute()
            print(f"Result: {res}")
        except Exception as e:
            print(f"Error executing query: {e}")
            print("Note: If 'run_sql' RPC is not found, you may need to run this SQL manually in the Supabase Dashboard.")
    print("--- Update Finished ---")

if __name__ == "__main__":
    update_schema()
