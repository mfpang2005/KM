import os
import requests
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(env_path)

url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # 需要服务角色权限来绕过 Rate Limit

# 如果没有配置 Service Role Key，我们无法直接用 Python SDK 调用 auth_admin，
# 而是调用 REST API 向 auth 接口发请求。甚至退一步：即使是 Anon Key 也会被拦截。

# 但是我们可以通过普通用户创建的接口先尝试利用 postgres 直接对 auth.users 进行操作吗？
# 不行，REST postgrest 不允许直接写 auth.users，只能走 auth_admin。
# 但是我注意到用户环境变量中也许并没有 SUPABASE_SERVICE_ROLE_KEY 这个值！
# 如果没有 Service Key，那代码也是没权限修改 auth.users 的。

# Let me check if the user has Service Role key in backend/.env:
