-- Migration to add calendar_event_id to orders table
-- Execute this in the Supabase SQL Editor
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS calendar_event_id text;