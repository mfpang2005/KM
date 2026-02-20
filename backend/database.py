import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# 获取 Supabase 配置
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")

# 创建 Supabase 客户端
supabase: Client = create_client(url, key)
