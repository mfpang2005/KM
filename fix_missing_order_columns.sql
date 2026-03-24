-- Run this in Supabase SQL Editor to fix missing columns for delivery confirmation
DO $$ 
BEGIN 
    -- 1. Ensure delivery_photos exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_photos'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN delivery_photos jsonb DEFAULT '[]';
    END IF;

    -- 2. Ensure paymentMethod exists (Mixed case needs quotes in some contexts, but here we add it)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'paymentMethod'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN "paymentMethod" text;
    END IF;

    -- 3. Ensure paymentStatus exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'paymentStatus'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN "paymentStatus" text DEFAULT 'unpaid';
    END IF;
END $$;
