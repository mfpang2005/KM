-- Add new vehicle fields for Fleet Central

ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS manufacturing_date TEXT,
ADD COLUMN IF NOT EXISTS insurance_company TEXT;
