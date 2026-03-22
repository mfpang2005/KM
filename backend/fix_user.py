import asyncio
from database import supabase

async def fix_user():
    user_id = "e6ffd66e-e23c-491e-9551-14c30c38c9fc"
    print(f"Assigning admin role to user {user_id}...")
    
    try:
        user_response = supabase.auth.admin.get_user_by_id(user_id)
        if user_response and user_response.user:
            email = user_response.user.email
            print(f"Found user email: {email}")
            
            # 2. Upsert into users table
            upsert_data = {
                "id": user_id,
                "email": email or "123@km.com",
                "role": "admin",
                "name": "Admin Manager"
            }
            try:
                res = supabase.table("users").upsert(upsert_data).execute()
                print("Successfully upserted user to admin role in database:")
                print(res.data)
            except Exception as dbe:
                print(f"DB Upsert Error: {dbe}")
                
            # 3. Update auth metadata
            try:
                res_meta = supabase.auth.admin.update_user_by_id(user_id, {"user_metadata": {"role": "admin"}})
                print("Successfully updated auth metadata.")
            except Exception as auxe:
                print(f"Auth Meta Error: {auxe}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(fix_user())
