import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(url, key)

def check_realtime():
    print("Checking Real-time Publication Status...")
    try:
        # We try to query the publication tables. 
        # Note: This might require higher permissions than the anon key.
        # But we can try to see if we can get anything from a rpc if it exists, 
        # or just try a direct select if RLS allows (unlikely for system tables).
        
        # Alternatively, let's just try to listen to the channel in a script.
        print("Note: Direct SQL query for system tables might fail with anon key.")
        
        # Another way to test: Insert a record and see if we can receive it in a separate process/thread?
        # Actually, let's just ask the user to run a SQL command in Supabase Editor to be sure.
        pass
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Since I cannot easily 'listen' in a short-lived script without a loop,
    # I will provide a SQL command for the user to run.
    print("""
    Please run the following SQL command in your Supabase SQL Editor to enable Realtime for critical tables:

    -- Enable Realtime for audit_logs
    alter publication supabase_realtime add table audit_logs;

    -- Enable Realtime for orders
    alter publication supabase_realtime add table orders;

    -- Enable Realtime for driver_assignments
    alter publication supabase_realtime add table driver_assignments;

    -- Enable Realtime for vehicles
    alter publication supabase_realtime add table vehicles;
    """)
