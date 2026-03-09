import os
import httpx
from dotenv import load_dotenv
import json

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
}

def get_table_schema():
    # PostgREST returns OpenAPI spec at the root of the API
    url = f"{SUPABASE_URL}/rest/v1/"
    try:
        response = httpx.get(url, headers=HEADERS)
        if response.status_code == 200:
            spec = response.json()
            definitions = spec.get("definitions", {})
            vehicles_schema = definitions.get("vehicles", {})
            print(json.dumps(vehicles_schema, indent=2))
        else:
            print(f"Failed to get schema: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    get_table_schema()
