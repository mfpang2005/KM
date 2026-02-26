"""
初始化 Supabase Storage Bucket 脚本
运行方法：python setup_storage.py

前置条件：
- 在 Supabase 控制台 → 项目 Settings → API 中找到 service_role key
- 将该 key 替换到下方 SERVICE_ROLE_KEY 变量
"""
import os
import httpx

SUPABASE_URL = "https://wryhvvakeysdbktvemzo.supabase.co"

# 在 Supabase 控制台 → Settings → API → service_role (secret) 中复制
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzNjY0MCwiZXhwIjoyMDg3MjEyNjQwfQ.jSX6PhPX1do1QOJl3bQVJ2tYrS5xDrL0TDF6EsAuUbc")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def create_bucket():
    """创建 delivery-photos Public Bucket"""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    payload = {
        "id": "delivery-photos",
        "name": "delivery-photos",
        "public": True,  # 公开 bucket，管理员可直接通过 URL 查看照片
        "file_size_limit": 10485760,  # 10 MB 单文件上传限制
        "allowed_mime_types": ["image/jpeg", "image/png", "image/webp", "image/heic"],
    }

    response = httpx.post(url, json=payload, headers=HEADERS)

    if response.status_code == 200:
        print("✅ Bucket 'delivery-photos' 创建成功（Public）")
    elif response.status_code == 409:
        print("ℹ️  Bucket 'delivery-photos' 已存在，跳过创建")
    else:
        print(f"❌ 创建 Bucket 失败: {response.status_code} - {response.text}")
        return False
    return True


def create_upload_policy():
    """通过 REST API 添加 Storage Policy，允许已认证用户上传"""
    # 使用 Supabase SQL 接口执行 RLS Policy
    url = f"{SUPABASE_URL}/rest/v1/rpc"

    policy_sql = """
    -- 已认证用户可上传到 delivery-photos bucket
    CREATE POLICY IF NOT EXISTS "Allow authenticated uploads"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'delivery-photos');

    -- 所有人可读（因为是 public bucket）
    CREATE POLICY IF NOT EXISTS "Allow public read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'delivery-photos');
    """

    sql_url = f"{SUPABASE_URL}/rest/v1/sql"
    response = httpx.post(sql_url, json={"query": policy_sql}, headers=HEADERS)

    if response.status_code in [200, 201]:
        print("✅ Storage Policy 配置成功（authenticated 可上传，public 可读）")
    else:
        # 注意：部分 Supabase 版本不支持直接 SQL，这里给出手动操作提示
        print(f"⚠️  Policy 自动配置失败（{response.status_code}），请手动在控制台添加：")
        print("   Supabase Dashboard → Storage → delivery-photos → Policies")
        print("   添加 INSERT Policy for 'authenticated' role")


if __name__ == "__main__":
    print("🚀 开始初始化 Supabase Storage...\n")

    if SERVICE_ROLE_KEY == "YOUR_SERVICE_ROLE_KEY_HERE":
        print("❌ 请先设置 SERVICE_ROLE_KEY！")
        print()
        print("获取方式：")
        print("  Supabase 控制台 → Settings → API → service_role (secret key)")
        print()
        print("设置方式（任选一）：")
        print("  1. 设置环境变量：set SUPABASE_SERVICE_ROLE_KEY=<your_key>")
        print("  2. 直接修改脚本第 16 行的 SERVICE_ROLE_KEY 变量")
        exit(1)

    success = create_bucket()
    if success:
        create_upload_policy()

    print("\n✅ 初始化完成！现在司机可以上传照片，管理员可以加载查阅了。")
