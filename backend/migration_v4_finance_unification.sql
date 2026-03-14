-- Unify Financial Fields Migration (v4)
-- Run this in the Supabase SQL Editor

-- 1. Rename deposit_amount to payment_received if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='deposit_amount') THEN
    ALTER TABLE public.orders RENAME COLUMN deposit_amount TO payment_received;
  END IF;
END $$;

-- 2. Add balance column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='balance') THEN
    ALTER TABLE public.orders ADD COLUMN balance NUMERIC DEFAULT 0;
  END IF;
END $$;

-- 3. Initialize/Update balance for all existing orders
UPDATE public.orders 
SET balance = COALESCE(amount, 0) - COALESCE(payment_received, 0);

-- 4. Ensure paymentStatus is consistent
UPDATE public.orders
SET "paymentStatus" = CASE 
  WHEN COALESCE(balance, 0) <= 0 THEN 'paid'
  ELSE 'unpaid'
END;
