-- 1. Create the delivery-photos bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public access to the delivery-photos bucket
-- Note: In a production environment, you might want to restrict this further.
-- For now, we allow both authenticated and anonymous users to insert and select.

-- INSERT Policy: Allow anyone to upload photos to this bucket
CREATE POLICY "Allow public upload for delivery-photos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'delivery-photos');

-- SELECT Policy: Allow anyone to view photos in this bucket
CREATE POLICY "Allow public select for delivery-photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'delivery-photos');

-- UPDATE Policy: Allow upsert if needed (e.g., retaking a photo)
CREATE POLICY "Allow public update for delivery-photos"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'delivery-photos');
