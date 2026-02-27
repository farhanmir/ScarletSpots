import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

try:
    # Try to select the column
    res = supabase.table("profiles").select("latitude").limit(1).execute()
    print("SUCCESS: 'latitude' column exists.")
except Exception as e:
    print(f"FAILURE: 'latitude' column missing or error: {e}")

try:
    res = supabase.table("profiles").select("longitude").limit(1).execute()
    print("SUCCESS: 'longitude' column exists.")
except Exception as e:
    print(f"FAILURE: 'longitude' column missing or error: {e}")
