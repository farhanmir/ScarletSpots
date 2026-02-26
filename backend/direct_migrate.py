import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")
# Assuming DATABASE_URL or equivalent exists in env, or we build it from Supabase credentials if it's local
db_url = os.environ.get("DATABASE_URL")

if not db_url:
    # Build it for local supabase default if not set
    db_url = "postgresql://postgres:postgres@localhost:54322/postgres"

def run_migrations():
    try:
        print(f"Connecting to {db_url}...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Adding coordinates to parking_lots...")
        cur.execute("ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS coordinates jsonb;")
        
        print("Adding spot_number to parking_sessions...")
        cur.execute("ALTER TABLE public.parking_sessions ADD COLUMN IF NOT EXISTS spot_number text;")
        
        # Reload PostgREST schema cache
        print("Reloading PostgREST schema cache...")
        cur.execute("NOTIFY pgrst, 'reload schema';")
        
        cur.close()
        conn.close()
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_migrations()
