import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SERVICE_ROLE_KEY = os.getenv('SUPABASE_KEY')

HEADERS = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

def execute_sql(sql_query: str):
    url = f'{SUPABASE_URL}/rest/v1/sql'
    print(f'Executing POST to {url} with query: {sql_query}')
    response = httpx.post(url, json={'query': sql_query}, headers=HEADERS)
    if response.status_code in [200, 201]:
        print('Success SQL Executed successfully:', response.text)
        return True
    else:
        print(f'Failed SQL Execution Failed: {response.status_code} - {response.text}')
        return False

sql = '''
ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_photos jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS equipments jsonb;
'''
execute_sql(sql)
