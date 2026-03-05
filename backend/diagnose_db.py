import os
import httpx
from dotenv import load_dotenv
import sys
import io

# 修复 Windows 控制台中文输出
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

def diagnose_db_errors():
    url = f"{SUPABASE_URL}/rest/v1/vehicles"
    
    # 1. 尝试插入一个非常简单的记录，看是否成功
    test_data = {
        "plate_no": "DIAGNOSE-001",
        "status": "available"
    }
    
    print("--- 诊断 1: 极简数据插入测试 ---")
    try:
        r = httpx.post(url, json=test_data, headers=HEADERS)
        print(f"状态码: {r.status_code}")
        if r.status_code >= 400:
            print(f"报错详情: {r.text}")
        else:
            print("插入成功")
            # 清理
            httpx.delete(f"{url}?plate_no=eq.DIAGNOSE-001", headers=HEADERS)
    except Exception as e:
        print(f"请求异常: {e}")

    # 2. 检查 capacity 字段类型
    print("\n--- 诊断 2: Capacity 字段类型边界测试 ---")
    # 之前发现前端可能传 ""，后端已处理为 None。我们再测试一下如果是字符串数字会怎样
    test_data_cap = {
        "plate_no": "DIAGNOSE-002",
        "capacity": 12.5
    }
    try:
        r = httpx.post(url, json=test_data_cap, headers=HEADERS)
        print(f"数字类型插入状态: {r.status_code}")
        if r.status_code < 400:
            httpx.delete(f"{url}?plate_no=eq.DIAGNOSE-002", headers=HEADERS)
    except Exception as e:
        print(f"请求异常: {e}")

if __name__ == "__main__":
    diagnose_db_errors()
