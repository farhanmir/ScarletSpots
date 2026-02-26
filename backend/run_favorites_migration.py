import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")

# Try to get the database URL from environment
db_url = os.environ.get("DATABASE_URL")

if not db_url:
    print("ERROR: DATABASE_URL not found in environment or .env file.")
    print("Please set DATABASE_URL to your Supabase connection string and try again.")
    print("Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres")
    exit(1)

def apply_migration():
    migration_path = os.path.join(os.path.dirname(__file__), "supabase", "migrations", "20260304_favorites_schema.sql")
    
    if not os.path.exists(migration_path):
        print(f"ERROR: Migration file not found at {migration_path}")
        return

    try:
        print(f"Connecting to database...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        print(f"Reading migration file: {migration_path}")
        with open(migration_path, 'r') as f:
            sql = f.read()
            
        print("Executing migration...")
        cur.execute(sql)
        
        print("Reloading PostgREST schema cache...")
        cur.execute("NOTIFY pgrst, 'reload schema';")
        
        cur.close()
        conn.close()
        print("SUCCESS: Migration applied successfully!")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    apply_migration()
