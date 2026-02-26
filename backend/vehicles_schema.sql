-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    plate_no TEXT UNIQUE NOT NULL,
    model TEXT,
    type TEXT,
    status TEXT CHECK (status IN ('available', 'busy', 'repair')) DEFAULT 'available',
    road_tax_expiry DATE,
    capacity NUMERIC,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
-- Create driver_assignments table
CREATE TABLE IF NOT EXISTS driver_assignments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    returned_at TIMESTAMP WITH TIME ZONE,
    status TEXT CHECK (status IN ('active', 'completed')) DEFAULT 'active'
);
-- Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_assignments ENABLE ROW LEVEL SECURITY;
-- Create Policies (Public access for dashboard usage. In production, restrict to authenticated/admin)
DROP POLICY IF EXISTS "Public vehicles access" ON vehicles;
CREATE POLICY "Public vehicles access" ON vehicles FOR ALL USING (true);
DROP POLICY IF EXISTS "Public assignments access" ON driver_assignments;
CREATE POLICY "Public assignments access" ON driver_assignments FOR ALL USING (true);