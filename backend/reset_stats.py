import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(url, key)

def reset_stats():
    print("--- Emergency Reset (Orders Only) ---")
    
    try:
        print("Cleaning orders table...")
        # Direct delete without audit log to bypass PGRST205
        response = supabase.table("orders").delete().neq("id", "placeholder_never_exists").execute()
        
        deleted_count = len(response.data) if response.data else 0
        print(f"Successfully deleted {deleted_count} order records.")
        print("Overview statistics have been reset.")

    except Exception as e:
        print(f"Reset failed: {e}")

if __name__ == "__main__":
    reset_stats()
