-- Add is_prepared field to order_items for kitchen prep tracking
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN DEFAULT FALSE;
-- Update existing rows based on current status field
UPDATE public.order_items
SET is_prepared = TRUE
WHERE status = 'ready';