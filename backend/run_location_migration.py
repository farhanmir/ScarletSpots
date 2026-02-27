import os
import sys

import psycopg2
from dotenv import load_dotenv

# Path to the .env file in the current directory
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

# Try to get the database URL from environment
db_url = os.environ.get("DATABASE_URL")

if not db_url:
    print("\n[MIGRATION ERROR]")
    print("DATABASE_URL not found in environment or .env file.")
    print("\nTo fix the 500 error in the mobile app, you must run this migration.")
    print("Please set DATABASE_URL to your Supabase connection string and try again.")
    print(
        "Example: set DATABASE_URL=postgresql://postgres:[PASSWORD]@db.dfkxffdplikdyhuvubnr.supabase.co:5432/postgres"
    )
    print(
        "\nYou can find your password and connection string in the Supabase Dashboard"
    )
    print("under Settings -> Database -> Connection string -> URI.")
    exit(1)


def apply_location_migration():
    migration_path = os.path.join(
        os.path.dirname(__file__),
        "supabase",
        "migrations",
        "20260306_add_profile_location.sql",
    )

    if not os.path.exists(migration_path):
        print(f"ERROR: Migration file not found at {migration_path}")
        return

    try:
        print("Connecting to database...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()

        print(f"Reading migration file: {migration_path}")
        with open(migration_path, "r") as f:
            sql = f.read()

        print("Executing migration...")
        # Split by semicolon to run multiple statements if needed,
        # though psycopg2 handles it fine in one execute() for simple scripts.
        cur.execute(sql)

        # Reload PostgREST schema cache so the new columns are visible to the API
        print("Reloading PostgREST schema cache...")
        cur.execute("NOTIFY pgrst, 'reload schema';")

        cur.close()
        conn.close()
        print("\nSUCCESS: Profile location migration applied successfully!")
        print(
            "The mobile app should now be able to report location without 500 errors."
        )
    except Exception as e:
        print(f"\n[FAILED] {e}")
        print(
            "\nCheck your DATABASE_URL and ensure you have permission to ALTER TABLE."
        )


if __name__ == "__main__":
    apply_location_migration()
