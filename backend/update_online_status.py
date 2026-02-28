from database import supabase

print('Adding is_online column to users table...')
res = supabase.rpc('run_sql', {'query': 'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;'}).execute()
print(res)
