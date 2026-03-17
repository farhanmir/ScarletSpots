import asyncio
from app.core.database import AsyncSessionLocal
from app.models.parking import LotOccupancy

async def test_insert():
    async with AsyncSessionLocal() as session:
        new_lot = LotOccupancy(lot_id="test_lot_1", count=42)
        session.add(new_lot)
        await session.commit()
        print("Successfully inserted test lot into Postgres 18!")

if __name__ == "__main__":
    asyncio.run(test_insert())
