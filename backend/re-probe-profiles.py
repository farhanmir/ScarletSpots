import os
from supabase import create_client
from dotenv import load_dotenv

# Path to the .env file in the current directory
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    exit(1)

client = create_client(supabase_url, supabase_key)

def probe_profiles():
    print(f"Probing 'profiles' table at {supabase_url}...")
    try:
        # Fetching a single row to see what columns come back
        response = client.table("profiles").select("*").limit(1).execute()
        if response.data:
            cols = list(response.data[0].keys())
            print(f"Columns in 'profiles' table: {cols}")
            
            target_cols = ["latitude", "longitude"]
            for col in target_cols:
                if col in cols:
                    print(f"Column '{col}': EXISTS")
                else:
                    print(f"Column '{col}': MISSING")
        else:
            print("No data found in 'profiles' table.")
            # Try specific selects to check existence without data
            for col in ["latitude", "longitude"]:
                try:
                    client.table("profiles").select(col).limit(1).execute()
                    print(f"Column '{col}': EXISTS (probed via SELECT)")
                except Exception as e:
                    print(f"Column '{col}': MISSING (probed via SELECT)")

    except Exception as e:
        print(f"CRITICAL ERROR: Failed to connect or query profiles table: {e}")

if __name__ == "__main__":
    probe_profiles()
