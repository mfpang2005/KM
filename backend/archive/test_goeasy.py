import os
import asyncio
from dotenv import load_dotenv
from services.goeasy import publish_message

async def test():
    load_dotenv()
    print(f"Testing GoEasy publish with AppKey: {os.getenv('GOEASY_APPKEY')[:5]}...")
    success = await publish_message({"type": "test_connection", "msg": "Hello from FastAPI Backend!"})
    if success:
        print("Test SUCCESS: Message published to GoEasy.")
    else:
        print("Test FAILED: Could not publish message.")

if __name__ == "__main__":
    asyncio.run(test())
