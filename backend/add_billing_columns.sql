-- Migration: Add missing billing columns to orders table
-- Run this in Supabase SQL Editor

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS "billingUnit" TEXT DEFAULT 'PAX',
ADD COLUMN IF NOT EXISTS "billingQuantity" FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "billingPricePerUnit" FLOAT DEFAULT 0.0;

-- Optional: Fix existing malformed dueTime strings if any 
-- Update orders set "dueTime" = created_at::text where "dueTime" not like '%T%';
