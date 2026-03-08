import asyncio
import os
import json
import base64
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("VITE_SUPABASE_URL")
key: str = os.environ.get("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

async def test_walkie_talkie():
    # 模拟 SuperAdmin 发送一条测试全局语音信息
    print("Testing Walkie Talkie Integration...")
    
    # 获取任意一个有效 driver
    drivers = supabase.table("users").select("*").eq("role", "driver").limit(1).execute()
    if not drivers.data:
        print("No drivers found to test with.")
        return

    driver = drivers.data[0]
    print(f"Testing with Driver: {driver['email']} (ID: {driver['id']})")

    # 我们通过检测 messages 表，来看是不是 sender_id 被成功保存成了 driver_id 即可
    # 这是一个被动检查：我们会发一条测试消息来触发 driver 
    # 或者，我们直接写一条由 Super Admin 发送的测试消息，看看 Supabase 是否能正确插入
    
    msg_data = {
        'sender_id': "super-admin-test-id",
        'sender_label': "Super Admin Test",
        'sender_role': "super_admin",
        'receiver_id': driver['id'], # 尝试给司机发私聊
        'content': "Test message",
        'type': "text"
    }

    print("Inserting test message into Supabase...")
    res = supabase.table("messages").insert([msg_data]).execute()
    
    if res.data:
        print(f"Message successfully inserted! ID: {res.data[0]['id']}")
        print("Integration Test Passed! Supabase message table accepts the correct IDs.")
    else:
        print("Failed to insert message.")

if __name__ == "__main__":
    asyncio.run(test_walkie_talkie())
