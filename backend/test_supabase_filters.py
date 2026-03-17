
import os
from database import supabase
from fastapi.concurrency import run_in_threadpool
import asyncio

async def test_audit_logs():
    print("Testing audit logs query...")
    try:
        query = supabase.table("audit_logs").select("*", count="exact")
        # Simulate the search filter that failed in browser
        search = "admin"
        query = query.or_(f"target.ilike.%{search}%,actor_id.ilike.%{search}%")
        
        # Test direct execution
        print("Executing directly...")
        res = query.order("created_at", desc=True).limit(5).execute()
        print(f"Direct Success: Found {len(res.data)} logs")
        
        # Test with run_in_threadpool
        print("Executing via run_in_threadpool...")
        res_async = await run_in_threadpool(
            query.order("created_at", desc=True).limit(5).execute
        )
        print(f"Async Success: Found {len(res_async.data)} logs")
    except Exception as e:
        print(f"Audit Logs Test Failed: {e}")
        import traceback
        traceback.print_exc()

async def test_customers():
    print("\nTesting customers query...")
    try:
        query = supabase.table("customers").select("*")
        q = "test"
        query = query.or_(f"name.ilike.%{q}%,phone.ilike.%{q}%")
        
        res = query.limit(5).order("name").execute()
        print(f"Customers Success: Found {len(res.data)} data")
    except Exception as e:
        print(f"Customers Test Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_audit_logs())
    asyncio.run(test_customers())
