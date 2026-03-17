import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from app.core.database import AsyncSessionLocal
from app.models.user import Profile
from app.models.favorite import UserFavorite
from sqlalchemy import insert

env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

# Supabase Credentials (from your .env)
S_URL = os.getenv("SUPABASE_URL")
S_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(S_URL, S_KEY)

async def sync():
    async with AsyncSessionLocal() as session:
        # 1. Pull Profiles from Supabase
        print("Fetching profiles from Supabase...")
        sb_profiles = supabase.table("profiles").select("*").execute()
        
        for p in sb_profiles.data:
            # Upsert into local Postgres
            profile = Profile(id=p['id'], email=p['email'], full_name=p.get('full_name'))
            await session.merge(profile)
        
        # 2. Pull Favorites
        print("Fetching favorites...")
        sb_favs = supabase.table("user_favorites").select("*").execute()
        for f in sb_favs.data:
            fav = UserFavorite(user_id=f['user_id'], lot_id=f['lot_id'])
            await session.merge(fav)
            
        await session.commit()
        print(f"Sync complete! Migrated {len(sb_profiles.data)} profiles.")

if __name__ == "__main__":
    asyncio.run(sync())
