import sys
import os
import importlib

# Add the current directory to sys.path to ensure we can import 'backend'
sys.path.append(os.getcwd())

print(f"Python Version: {sys.version}")
print(f"Executable: {sys.executable}")

def check_import(module_name):
    try:
        importlib.import_module(module_name)
        print(f"✅ {module_name} found")
    except ImportError:
        print(f"❌ {module_name} NOT FOUND")
    except Exception as e:
        print(f"❌ {module_name} error: {e}")

print("\n--- Checking Dependencies ---")
check_import("fastapi")
check_import("uvicorn")
check_import("supabase")
check_import("dotenv")

print("\n--- Checking Project Modules ---")
try:
    from backend import database # type: ignore
    print("✅ backend.database imported")
except ImportError as e:
    print(f"❌ backend.database failed: {e}")

try:
    from backend import models # type: ignore
    print("✅ backend.models imported")
except ImportError as e:
    print(f"❌ backend.models failed: {e}")

try:
    from backend.routers import users # type: ignore
    print("✅ backend.routers.users imported")
except ImportError as e:
    print(f"❌ backend.routers.users failed: {e}")
