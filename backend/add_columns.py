from database import supabase

print('Adding batch column...')
res1 = supabase.rpc('run_sql', {'query': 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch text;'}).execute()
print(res1)

print('Adding delivery_photos column...')
res2 = supabase.rpc('run_sql', {'query': 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_photos jsonb;'}).execute()
print(res2)

print('Adding equipments column...')
res3 = supabase.rpc('run_sql', {'query': 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS equipments jsonb;'}).execute()
print(res3)
