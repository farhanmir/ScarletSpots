import asyncio
from app.core.security import get_supabase

async def check_table():
    db = get_supabase()
    try:
        res = db.table('parking_sessions').select('*').limit(1).execute()
        print("parking_sessions exists:", res.data)
    except Exception as e:
        print("Error parking_sessions:", e)
        
    try:
        res = db.table('occupancy_logs').select('*').limit(1).execute()
        print("occupancy_logs exists:")
    except Exception as e:
        print("Error occupancy_logs:", e)

if __name__ == "__main__":
    asyncio.run(check_table())
