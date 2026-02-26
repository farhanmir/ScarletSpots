import sys
import os
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

client = create_client(supabase_url, supabase_key)

def migrate_lots():
    print("Fetching lots from kv_store_8814ba2a...")
    
    # Try fetching all rows from the KV table
    response = client.table("kv_store_8814ba2a").select("*").execute()
    rows = response.data
    
    lots = []
    for row in rows:
        key = row.get("key", "")
        # Deno KV typically stores keys as arrays or concatenated strings
        if "lot:" in key or "custom:" in key or (isinstance(key, str) and ("lot" in key.lower() or "custom" in key.lower())):
            pass
        
        # More accurately, let's just inspect the value object
        val = row.get("value", {})
        if isinstance(val, dict):
            # Check if it looks like a lot
            if "capacity" in val and "latitude" in val and "longitude" in val and "name" in val:
                # We found a lot! Let's format it.
                lot = {
                    "id": val.get("id", "").split(":")[-1] if ":" in val.get("id", "") else val.get("id", ""),
                    "name": val.get("name"),
                    "campus": val.get("campus", "Unknown"),
                    "latitude": val.get("latitude"),
                    "longitude": val.get("longitude"),
                    "capacity": val.get("capacity"),
                    "is_custom": val.get("isCustom", False),
                    "coordinates": val.get("coordinates")
                }
                
                # If coordinates are stringified (Legacy Deno KV quirk), parse them now
                if isinstance(lot["coordinates"], str):
                    try:
                        lot["coordinates"] = json.loads(lot["coordinates"])
                    except:
                        pass
                # Fix ID if empty
                if not lot["id"]:
                    import uuid
                    lot["id"] = str(uuid.uuid4())
                    
                # Ensure valid UUID for id
                try:
                    import uuid
                    uuid.UUID(lot["id"])
                except ValueError:
                    lot["id"] = str(uuid.uuid4())
                    
                lots.append(lot)
                
    print(f"Parsed {len(lots)} lots from the KV store.")
    
    if lots:
        print("Upserting into parking_lots...")
        try:
            # We must use upsert to overlay the new format without duplicate ID errors
            res = client.table("parking_lots").upsert(lots).execute()
            print("Successfully migrated lots:", len(res.data))
        except Exception as e:
            print("Failed to upsert:", e)
            
if __name__ == "__main__":
    migrate_lots()
