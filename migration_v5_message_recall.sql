-- MIGRATION: Add is_recalled column to messages table
-- Author: Antigravity
-- Date: 2026-04-04

-- 1. Add column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN DEFAULT FALSE;

-- 2. Update existing policies if necessary (usually not needed for just a new column)
-- 3. Ensure the Realtime publication still includes the new column
-- (Supabase Realtime usually picks up new columns automatically)

COMMENT ON COLUMN public.messages.is_recalled IS 'Flag indicating if the message has been withdrawn/recalled by the sender.';
