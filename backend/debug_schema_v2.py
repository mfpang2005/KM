from database import supabase
import json

def check_columns(table_name):
    print(f"\n--- Checking columns for table: {table_name} ---")
    try:
        res = supabase.table(table_name).select("*").limit(1).execute()
        if res.data:
            print("Columns found in existing row:")
            print(list(res.data[0].keys()))
        else:
            print(f"Table {table_name} is empty or does not exist.")
            # Try a dummy insert with minimal data to see if it fails due to missing table or columns
            print("Attempting minimal insert...")
            try:
                # Use a random UUID for id if it's uuid, or just ignore it if it's autogen
                dummy_res = supabase.table(table_name).insert({"email": "test@example.com", "role": "admin"}).execute()
                print("Minimal insert successful.")
                print(list(dummy_res.data[0].keys()))
                # Cleanup
                supabase.table(table_name).delete().eq("email", "test@example.com").execute()
            except Exception as insert_e:
                print(f"Minimal insert failed: {insert_e}")
    except Exception as e:
        print(f"Error selecting from {table_name}: {e}")

if __name__ == "__main__":
    check_columns("users")
    check_columns("audit_logs")
    
    print("\n--- Testing Role Constraint ---")
    try:
        # Try to insert a super_admin role
        res = supabase.table("users").insert({
            "email": "test_super@example.com",
            "role": "super_admin",
            "name": "Super Test"
        }).execute()
        print("Successfully inserted super_admin role.")
        supabase.table("users").delete().eq("email", "test_super@example.com").execute()
    except Exception as e:
        print(f"Failed to insert super_admin role: {e}")
