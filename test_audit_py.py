
import asyncio
import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.audit import record_audit, AuditActions

async def test_audit():
    print("--- Testing Audit Recording via Python Service ---")
    try:
        await record_audit(
            actor_id="00000000-0000-0000-0000-000000000000",
            actor_role="system_test_py",
            action="test_audit_py",
            target="test_target_py",
            detail={"message": "Testing from Python script"}
        )
        print("Audit recording call finished (it's non-blocking, check logs if it fails internally)")
    except Exception as e:
        print(f"Error calling record_audit: {e}")

if __name__ == "__main__":
    asyncio.run(test_audit())
