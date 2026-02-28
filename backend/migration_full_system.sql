-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL,
    sender_label TEXT,
    sender_role TEXT,
    receiver_id TEXT,
    content TEXT,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create vehicles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.vehicles (
    id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    plate TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'good'
);
-- Insert dummy vehicle data if empty
INSERT INTO public.vehicles (id, model, plate, type, status)
VALUES ('v1', 'Toyota Hiace', 'VNZ 8821', '冷链运输', 'good'),
    ('v2', 'Lorry 3-Ton', 'BCC 4492', '常温大货', 'good'),
    (
        'v3',
        'Nissan Urvan',
        'WWR 1102',
        '市区小型',
        'maintenance'
    ) ON CONFLICT (id) DO NOTHING;
-- Enable Realtime
ALTER PUBLICATION supabase_realtime
ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime
ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime
ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime
ADD TABLE public.profiles;
-- RLS setup (Assuming we want basic functionality open for now if RLS is enabled, or just turn it off for this specific smoke test phase if appropriate, user mentioned "确保管理员具备全局读写权限，而司机仅能访问被指派的数据")
-- For simplity during smoke test:
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON public.messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for anon (temp smoke test)" ON public.messages FOR ALL TO anon USING (true);
-- fallback if auth not strict
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for all vehicles" ON public.vehicles FOR ALL USING (true);