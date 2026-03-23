-- 1. Enable Realtime for messages table
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
  END $$;
COMMIT;

-- 2. Setup RLS Policies for messages
-- We enable RLS but allow all access for now to ensure synchronization works across different roles and anonymous tests
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all" ON public.messages;
CREATE POLICY "Enable read access for all" ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert access for all" ON public.messages;
CREATE POLICY "Enable insert access for all" ON public.messages FOR INSERT WITH CHECK (true);

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
