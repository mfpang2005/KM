from database import supabase
import uuid

def debug_create_user():
    print("\n--- Debugging Supabase Admin User Creation ---")
    test_email = f"debug_{uuid.uuid4().hex[:6]}@example.com"
    test_password = "password123"
    
    print(f"Attempting to create user: {test_email}")
    try:
        # Test Auth Admin
        auth_res = supabase.auth.admin.create_user({
            "email": test_email,
            "password": test_password,
            "email_confirm": True
        })
        
        if auth_res.user:
            print("SUCCESS: Auth user created.")
            user_id = auth_res.user.id
            print(f"User ID: {user_id}")
            
            # Test Table Insert
            print("Attempting to insert into 'users' table...")
            try:
                db_res = supabase.table("users").insert({
                    "id": user_id,
                    "email": test_email,
                    "role": "driver",
                    "status": "active"
                }).execute()
                print("SUCCESS: DB record inserted.")
                print(f"DB Response: {db_res.data}")
                
                # Cleanup
                supabase.table("users").delete().eq("id", user_id).execute()
                supabase.auth.admin.delete_user(user_id)
                print("Cleanup completed.")
                
            except Exception as e:
                print(f"FAILED to insert into DB table: {e}")
                # Try to delete auth user anyway
                supabase.auth.admin.delete_user(user_id)
        else:
            print(f"FAILED to create Auth user (no user returned). Status: {auth_res}")
            
    except Exception as e:
        print(f"EXCEPTION during Auth Admin operation: {e}")
        if "403" in str(e) or "Unauthorized" in str(e):
            print("\nPROBABLE CAUSE: Your SUPABASE_KEY is likely the 'Anon Key' instead of the 'Service Role Key'.")
            print("Admin operations require the 'Service Role Key' (secret key).")

if __name__ == "__main__":
    debug_create_user()
