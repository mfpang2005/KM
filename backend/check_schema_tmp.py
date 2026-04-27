from database import supabase
import sys

def check():
    print("--- Database Schema Check ---")
    try:
        # 1. 尝试获取一条消息
        res = supabase.table('messages').select('*').limit(1).execute()
        if res.data:
            print(f"Success! Found a message.")
            print(f"Columns: {list(res.data[0].keys())}")
            if 'is_recalled' in res.data[0]:
                print("Column 'is_recalled' EXISTS.")
            else:
                print("Column 'is_recalled' MISSING! This is why recall fails.")
        else:
            print("Messages table is empty. Please send a message first.")
            
        # 2. 检查表是否存在
        print("\nChecking if table exists...")
        # (Supabase doesn't have a direct describe, we just try to select)
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()
