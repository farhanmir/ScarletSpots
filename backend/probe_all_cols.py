import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(supabase_url, supabase_key)

def probe_all():
    cols = ["latitude", "longitude", "active", "start_time", "end_time", "created_at"]
    for col in cols:
        try:
            # Try to select the column
            client.table("parking_sessions").select(col).limit(1).execute()
            print(f"Column '{col}': EXISTS")
        except Exception as e:
            print(f"Column '{col}': MISSING ({e.args[0]['message'] if isinstance(e.args[0], dict) else e})")

if __name__ == "__main__":
    probe_all()
