from database import supabase
import json

def check_table_schema(table_name):
    print(f"\n--- Checking table: {table_name} ---")
    query = f"""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = '{table_name}';
    """
    try:
        res = supabase.rpc('run_sql', {'query': query}).execute()
        if res.data:
            for col in res.data:
                print(f"{col['column_name']} ({col['data_type']}) - Nullable: {col['is_nullable']}")
        else:
            print(f"No results for {table_name} or table does not exist.")
    except Exception as e:
        print(f"Error checking {table_name}: {e}")

if __name__ == "__main__":
    check_table_schema("users")
    check_table_schema("audit_logs")
    
    # Also check constraints for users table
    print("\n--- Checking Users Role Constraints ---")
    role_query = """
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'users'::regclass AND contype = 'c';
    """
    try:
        res = supabase.rpc('run_sql', {'query': role_query}).execute()
        if res.data:
            print(json.dumps(res.data, indent=2))
        else:
            print("No constraints found.")
    except Exception as e:
        print(f"Error checking constraints: {e}")
