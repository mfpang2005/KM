-- 1. Enable Realtime for critical tables
BEGIN;
  -- Try to add tables to the publication. 
  -- We use a DO block to check if the table is already in the publication to avoid errors.
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audit_logs') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'driver_assignments') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE driver_assignments;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vehicles') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE customers;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    END IF;
  END $$;
COMMIT;

-- 2. Setup RLS Policies (Allow all to SELECT for now to ensure Realtime works)
-- Audit Logs
DROP POLICY IF EXISTS "Enable read access for all users" ON audit_logs;
CREATE POLICY "Enable read access for all users" ON audit_logs FOR SELECT USING (true);

-- Orders
DROP POLICY IF EXISTS "Enable read access for all users" ON orders;
CREATE POLICY "Enable read access for all users" ON orders FOR SELECT USING (true);

-- Customers
DROP POLICY IF EXISTS "Enable read access for all users" ON customers;
CREATE POLICY "Enable read access for all users" ON customers FOR SELECT USING (true);

-- Order Items
DROP POLICY IF EXISTS "Enable read access for all users" ON order_items;
CREATE POLICY "Enable read access for all users" ON order_items FOR SELECT USING (true);

-- Driver Assignments
DROP POLICY IF EXISTS "Enable read access for all users" ON driver_assignments;
CREATE POLICY "Enable read access for all users" ON driver_assignments FOR SELECT USING (true);

-- Vehicles
DROP POLICY IF EXISTS "Enable read access for all users" ON vehicles;
CREATE POLICY "Enable read access for all users" ON vehicles FOR SELECT USING (true);

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
