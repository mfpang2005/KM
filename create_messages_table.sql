-- Ensure messages table exists with correct schema for custom string IDs
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY, -- Using TEXT to support custom worker-timestamp IDs
    sender_id TEXT NOT NULL, -- Changed to TEXT for compatibility with all IDs
    sender_label TEXT,
    sender_role TEXT,
    receiver_id TEXT NOT NULL DEFAULT 'GLOBAL',
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    duration FLOAT DEFAULT 0, -- Added for audio message duration
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Realtime (Ignore error if already added)
BEGIN;
  DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END $$;
COMMIT;

-- RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all" ON public.messages;
CREATE POLICY "Enable read access for all" ON public.messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert access for all" ON public.messages;
CREATE POLICY "Enable insert access for all" ON public.messages FOR INSERT WITH CHECK (true);
