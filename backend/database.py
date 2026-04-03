import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

try:
    from supabase import ClientOptions
except ImportError:
    ClientOptions = None

load_dotenv()

logger = logging.getLogger(__name__)

# 获取 Supabase 配置
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")

# NOTE: 配置合理的超时，防止慢查询/网络抖动导致事件循环长时间挂起
if ClientOptions:
    try:
        supabase: Client = create_client(
            url, key,
            options=ClientOptions(
                postgrest_client_timeout=30,
                storage_client_timeout=30,
            )
        )
        logger.info("Supabase client initialized with 30s timeout")
    except Exception:
        supabase: Client = create_client(url, key)
        logger.info("Supabase client initialized (no custom timeout)")
else:
    supabase: Client = create_client(url, key)
