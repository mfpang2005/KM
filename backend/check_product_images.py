import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

def check_images():
    response = supabase.table("products").select("id, name, code, image_url").execute()
    for product in response.data:
        print(f"ID: {product['id']}, Name: {product['name']}, Code: {product['code']}, Image: {product['image_url']}")

if __name__ == "__main__":
    check_images()
