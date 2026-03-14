from database import supabase
import sys

def check_customers_table():
    try:
        # Try to select from customers table
        supabase.table("customers").select("*").limit(1).execute()
        print("Table 'customers' exists.")
        return True
    except Exception as e:
        if "relation \"customers\" does not exist" in str(e):
            print("Table 'customers' DOES NOT exist.")
        else:
            print(f"Error checking table: {e}")
        return False

if __name__ == "__main__":
    check_customers_table()
