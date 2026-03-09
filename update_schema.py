import os
import requests
from supabase import create_client, Client

# Correct values based on check_db_schema.mjs
SUPABASE_URL = "https://wryhvvakeysdbktvemzo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzNjY0MCwiZXhwIjoyMDg3MjEyNjQwfQ.jSX6PhPX1do1QOJl3bQVJ2tYrS5xDrL0TDF6EsAuUbc"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def add_columns_via_rest():
    """
    Supabase REST API doesn't support ALTER TABLE directly. 
    Usually one uses the SQL Editor. 
    However, we can try to use a little trick or just recommend the SQL.
    Since I have the service_role key, I might be able to use the SQL API.
    """
    sql_url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql" # This is a common custom function if exists
    
    # Alternative: Use the SQL API directly if available (often it's not exposed publicly)
    # Most reliable: Tell the user exactly what SQL to run OR use a Python migration if we have a proper DB connection.
    
    print("\n--- DATABASE MIGRATION REQUIRED ---")
    print("Please run the following SQL in your Supabase SQL Editor (Dashboard):")
    print("""
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS deposit_amount FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS remark TEXT;
    """)
    print("----------------------------------\n")
    
    # We will try to test if we can insert a record with these fields
    test_data = {
        "customerName": "Migration Test",
        "customerPhone": "0000",
        "address": "Test",
        "items": [],
        "status": "pending",
        "dueTime": "2026-01-01T00:00:00",
        "amount": 0.0,
        "type": "delivery",
        "deposit_amount": 0.0,
        "remark": "test"
    }
    
    print("Verifying if columns already exist...")
    try:
        resp = supabase.table("orders").insert(test_data).execute()
        if resp.data:
            print("SUCCESS: Columns 'deposit_amount' and 'remark' are ALREADY present.")
            # Cleanup
            supabase.table("orders").delete().eq("customerName", "Migration Test").execute()
            return True
        else:
            print("FAILURE: Verification failed. Data was not inserted correctly.")
            return False
    except Exception as e:
        if "column \"deposit_amount\" of relation \"orders\" does not exist" in str(e) or "column \"remark\" of relation \"orders\" does not exist" in str(e):
            print("CONFIRMED: Columns are MISSING.")
        else:
            print(f"Error during verification: {e}")
        return False

if __name__ == "__main__":
    add_columns_via_rest()
