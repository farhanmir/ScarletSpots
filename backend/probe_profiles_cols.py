import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env from current or parent dir
load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
# Use service role key if available, else anon
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

client: Client = create_client(supabase_url, supabase_key)

def check_profiles_columns():
    print(f"Checking Supabase at {supabase_url}...")
    try:
        # Fetching a single row to see what columns come back
        response = client.table("profiles").select("*").limit(1).execute()
        if response.data:
            cols = response.data[0].keys()
            print(f"Columns in 'profiles' table: {list(cols)}")
            if "latitude" in cols and "longitude" in cols:
                print("SUCCESS: Latitude and longitude columns exist.")
            else:
                if "latitude" not in cols:
                    print("ERROR: 'latitude' column is missing.")
                if "longitude" not in cols:
                    print("ERROR: 'longitude' column is missing.")
        else:
            print("No data found in 'profiles' table, but query succeeded (table exists).")
            # Try to update a non-existent row with the new columns to see if it errors
            try:
                # UUID that definitely doesn't exist
                dummy_id = "00000000-0000-0000-0000-000000000000"
                client.table("profiles").update({"latitude": 0.0, "longitude": 0.0}).eq("id", dummy_id).execute()
                print("UPDATE SUCCESS: Columns seem to exist (update on empty row worked).")
            except Exception as e:
                print(f"UPDATE ERROR: Update with lat/lng failed. Columns likely missing. Error: {e}")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to connect or query profiles table: {e}")

if __name__ == "__main__":
    check_profiles_columns()
