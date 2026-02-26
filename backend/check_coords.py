import os
from supabase import create_client
from dotenv import load_dotenv
import json

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(supabase_url, supabase_key)

def check_coords():
    res = client.table("parking_lots").select("id, name, coordinates").not_.is_("coordinates", "null").limit(1).execute()
    data = res.data
    if data:
        print(json.dumps(data[0], indent=2))
    else:
        print("No coordinates found in database.")

if __name__ == "__main__":
    check_coords()
