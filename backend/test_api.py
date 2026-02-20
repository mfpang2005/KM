import httpx
import asyncio
from dotenv import load_dotenv
import os

# 1. 自动加载环境变量
load_dotenv()

BASE_URL = "http://127.0.0.1:8000"  # 确保你的 FastAPI 已经启动

async def test_backend_flow():
    print("Starting backend dependency test...")
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        try:
            # Test 1: Health Check
            print("--- Test 1: Endpoint Connectivity ---")
            response = await client.get("/")
            print(f"Status: {response.status_code}, Response: {response.json()}")
            
            # Test 2: Business logic test
            print("\n--- Test 2: Business Interface Test ---")
            biz_response = await client.get("/api/v1/status")
            if biz_response.status_code == 200:
                print("OK: Business interface active")
            else:
                print(f"Warning: Business interface status: {biz_response.status_code}")

        except httpx.ConnectError:
            print("\nError: Could not connect to server. Please ensure 'uvicorn main:app --reload' is running.")
        except Exception as e:
            print(f"\nError: Unexpected error occurred: {e}")

if __name__ == "__main__":
    # 运行异步测试
    asyncio.run(test_backend_flow())
