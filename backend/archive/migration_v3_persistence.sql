-- 1. 创建 recipes 表
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    ingredients JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- 2. 创建 system_config 表
CREATE TABLE IF NOT EXISTS public.system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);
-- 3. 创建 order_items 表 (如果不存在)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
    is_prepared BOOLEAN DEFAULT FALSE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- 4. 启用 Realtime
ALTER PUBLICATION supabase_realtime
ADD TABLE public.recipes;
ALTER PUBLICATION supabase_realtime
ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime
ADD TABLE public.system_config;
-- 5. 插入初始配置数据 (可选)
INSERT INTO public.system_config (key, value)
VALUES ('finance_goal', '{"amount": 100000}'),
    ('finance_display', '{"enabled": true}') ON CONFLICT (key) DO NOTHING;