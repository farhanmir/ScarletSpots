import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(supabase_url, supabase_key)

def check_schema():
    # Since we can't run raw SQL easily without a direct DB connection,
    # let's try to fetch a single row to see if it even connects,
    # or look at the error message from a failed insert.
    try:
        # Try to insert a row with all expected columns to see what fails
        dummy_data = {
            "user_id": "00000000-0000-0000-0000-000000000000", # Will fail FK but might give schema info
            "lot_id": "00000000-0000-0000-0000-000000000000",
            "spot_number": "test",
            "start_time": "2026-01-01T00:00:00Z"
        }
        res = client.table("parking_sessions").insert(dummy_data).execute()
    except Exception as e:
        print(f"Schema Error Check: {e}")

if __name__ == "__main__":
    check_schema()
