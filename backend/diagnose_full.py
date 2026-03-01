from database import supabase
import uuid
import sys

def diagnose():
    test_email = f"diag_{uuid.uuid4().hex[:6]}@example.com"
    test_password = "Password123!"
    test_phone = f"+6012{uuid.uuid4().hex[:7]}" if len(f"+6012{uuid.uuid4().hex[:7]}") <= 15 else f"+60123456789"
    # Truncate phone to be safe (Supabase usually expects E.164)
    test_phone = test_phone[:13] 
    
    print(f"Starting diagnosis with email: {test_email} and phone: {test_phone}")
    
    user_id = None
    try:
        # Step 1: Auth Admin User Creation
        print("\nStep 1: Attempting to create user in Supabase Auth with metadata and phone attributes...")
        auth_attributes = {
            "email": test_email,
            "password": test_password,
            "email_confirm": True,
            "user_metadata": {"name": "Diag User", "role": "driver"}
        }
        
        # Testing if phone_confirm or phone_confirmed is the issue
        auth_attributes["phone"] = test_phone
        auth_attributes["phone_confirm"] = True # Let's try this
        
        print(f"Auth attributes: {auth_attributes}")
        
        try:
            auth_res = supabase.auth.admin.create_user(auth_attributes)
            print(f"Auth response type: {type(auth_res)}")
            
            # Check error
            error = getattr(auth_res, "error", None)
            if error:
                 print(f"ERROR Step 1 (Auth Error Object): {error}")
                 return
            
            user = getattr(auth_res, "user", None)
            if not user:
                 if isinstance(auth_res, dict) and "user" in auth_res:
                      user_id = auth_res["user"].get("id")
                      print(f"SUCCESS Step 1 (Dict): user_id={user_id}")
                 else:
                      print(f"ERROR Step 1: No user returned. Response: {auth_res}")
                      return
            else:
                 user_id = user.id
                 print(f"SUCCESS Step 1 (Object): user_id={user_id}")
                 
        except Exception as auth_e:
            print(f"EXCEPTION Step 1: {type(auth_e).__name__}: {auth_e}")
            return
            
        if not user_id:
            print("ERROR: user_id is None after Step 1")
            return

        # Step 2: Full Database Table Insertion
        print("\nStep 2: Attempting FULL insert into 'users' table...")
        full_data = {
            "id": user_id,
            "email": test_email,
            "role": "driver",
            "name": "Diag User",
            "phone": test_phone,
            "status": "active",
            "is_disabled": False,
            "employee_id": "DIAG-001"
        }
        print(f"Inserting data: {full_data}")
        
        try:
            db_res = supabase.table("users").insert(full_data).execute()
            print(f"SUCCESS Step 2: Full DB insertion complete. Data: {db_res.data}")
        except Exception as db_e:
            print(f"EXPECTED/ACTUAL ERROR Step 2: {type(db_e).__name__}: {db_e}")
            
            # Step 3: Basic Database Table Insertion
            print("\nStep 3: Attempting BASIC insert into 'users' table...")
            basic_data = {
                "id": user_id,
                "email": test_email,
                "role": "driver",
                "name": "Diag User",
                "phone": test_phone
            }
            try:
                db_res = supabase.table("users").insert(basic_data).execute()
                print(f"SUCCESS Step 3: Basic DB insertion complete. Data: {db_res.data}")
            except Exception as final_e:
                print(f"ERROR Step 3: {type(final_e).__name__}: {final_e}")
            
    except Exception as e:
        print(f"CRITICAL EXCEPTION: {type(e).__name__}: {e}")
    finally:
        if user_id:
            print(f"\nCleaning up user {user_id}...")
            try:
                supabase.auth.admin.delete_user(user_id)
                supabase.table("users").delete().eq("id", user_id).execute()
                print("Cleanup complete.")
            except Exception as clean_e:
                print(f"Cleanup failed: {clean_e}")

if __name__ == "__main__":
    diagnose()
