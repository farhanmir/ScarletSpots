from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logger import get_logger
from app.core.security import get_current_user
from app.models.favorite import UserFavorite

log = get_logger(__name__)

router = APIRouter(prefix="/favorites", tags=["favorites"])


def _to_uuid_or_401(user_id: str) -> UUID:
    try:
        return UUID(str(user_id))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid authenticated user id") from exc


@router.get("")
async def get_favorites(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all favorite lots for the current user.

    Lot metadata (name, campus, coords) lives in the mobile app's bundled JSON.
    This endpoint only returns the lot_id strings so the client can look them up locally.
    """
    try:
        user_id = _to_uuid_or_401(current_user.id)
        rows = (
            (await db.execute(select(UserFavorite.lot_id).where(UserFavorite.user_id == user_id)))
            .scalars()
            .all()
        )
        return {"favorite_lots": [{"lot_id": row} for row in rows]}
    except Exception as exc:
        log.error("Failed to get favorites: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve favorites")


@router.post("/{lot_id}")
async def add_favorite(
    lot_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a lot to favorites."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        existing = await db.execute(
            select(UserFavorite).where(
                UserFavorite.user_id == user_id,
                UserFavorite.lot_id == lot_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return {"success": True, "message": "Already favorited"}

        db.add(UserFavorite(user_id=user_id, lot_id=lot_id))
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to add favorite: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to add favorite")


@router.delete("/{lot_id}")
async def remove_favorite(
    lot_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a lot from favorites."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        await db.execute(
            delete(UserFavorite).where(
                UserFavorite.user_id == user_id,
                UserFavorite.lot_id == lot_id,
            )
        )
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to remove favorite: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to remove favorite")
