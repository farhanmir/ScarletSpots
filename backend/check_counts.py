import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(supabase_url, supabase_key)

def check_counts():
    res = client.table("parking_lots").select("name, coordinates").execute()
    data = res.data
    total = len(data)
    with_coords = [l for l in data if l.get("coordinates")]
    print(f"Total Lots: {total}")
    print(f"Lots with coords: {len(with_coords)}")
    
    if total > 0:
        print("\nFirst 10 lots:")
        for l in data[:10]:
            has = "YES" if l.get("coordinates") else "NO"
            print(f"- {l['name']} (Coords: {has})")

if __name__ == "__main__":
    check_counts()
