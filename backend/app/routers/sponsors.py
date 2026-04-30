from collections import defaultdict
from datetime import UTC, datetime, timedelta
from math import atan2, cos, radians, sin, sqrt
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.security import get_current_user

router = APIRouter(prefix="/sponsors", tags=["sponsors"])


class SponsorHours(BaseModel):
    mon: list[str] = []
    tue: list[str] = []
    wed: list[str] = []
    thu: list[str] = []
    fri: list[str] = []
    sat: list[str] = []
    sun: list[str] = []


class Sponsor(BaseModel):
    id: str
    name: str
    category: str
    address: str
    latitude: float
    longitude: float
    phone: str
    website_url: str
    hours_json: SponsorHours
    promo_code: str
    promo_text: str
    about: str
    hero_photo_url: str
    is_active: bool
    billing_plan: str
    billing_status: str
    semester_start: str
    semester_end: str
    priority_score: int = 0
    distance_meters: float | None = None


class SponsorListResponse(BaseModel):
    sponsors: list[Sponsor]


class SponsorEventRequest(BaseModel):
    sponsor_id: str
    event_type: str
    session_id: str | None = None
    metadata: dict | None = None


class SponsorEventRollup(BaseModel):
    sponsor_id: str
    event_type: str
    count: int


class SponsorReportResponse(BaseModel):
    events: list[SponsorEventRollup]


class SponsorNotificationCandidate(BaseModel):
    sponsor: Sponsor | None
    notification_text: str | None
    blocked_reason: str | None = None


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return radius * c


_SPONSORS: list[Sponsor] = [
    Sponsor(
        id="haraz-coffee-house",
        name="Haraz Coffee House",
        category="Coffee Shop",
        address="385 George St, New Brunswick, NJ 08901",
        latitude=40.49672,
        longitude=-74.44455,
        phone="(732) 659-6241",
        website_url="https://harazcoffeehouse.com/",
        hours_json=SponsorHours(
            mon=["08:00-22:00"],
            tue=["08:00-22:00"],
            wed=["08:00-22:00"],
            thu=["08:00-22:00"],
            fri=["08:00-23:00"],
            sat=["08:00-23:00"],
            sun=["09:00-22:00"],
        ),
        promo_code="XR20",
        promo_text="20% off one drink order",
        about="Specialty Yemeni-style coffee and espresso near downtown New Brunswick.",
        hero_photo_url="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80",
        is_active=True,
        billing_plan="semester_50",
        billing_status="paid",
        semester_start="2026-09-01",
        semester_end="2026-12-20",
        priority_score=88,
    ),
    Sponsor(
        id="artichoke-basilles-pizza",
        name="Artichoke Basille's Pizza",
        category="Pizza",
        address="246 Easton Ave, New Brunswick, NJ 08901",
        latitude=40.50066,
        longitude=-74.44916,
        phone="(732) 317-2000",
        website_url="https://www.artichokepizza.com/",
        hours_json=SponsorHours(
            mon=["11:00-00:00"],
            tue=["11:00-00:00"],
            wed=["11:00-00:00"],
            thu=["11:00-00:00"],
            fri=["11:00-02:00"],
            sat=["11:00-02:00"],
            sun=["11:00-23:00"],
        ),
        promo_code="SLICE50",
        promo_text="50% off one specialty slice",
        about="Popular late-night pizza spot on Easton Ave close to student housing.",
        hero_photo_url="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80",
        is_active=True,
        billing_plan="semester_50",
        billing_status="paid",
        semester_start="2026-09-01",
        semester_end="2026-12-20",
        priority_score=84,
    ),
    Sponsor(
        id="tacoria-new-brunswick",
        name="Tacoria New Brunswick",
        category="Fast Casual",
        address="56 Easton Ave, New Brunswick, NJ 08901",
        latitude=40.49720,
        longitude=-74.44467,
        phone="(732) 354-4282",
        website_url="https://tacoria.com/",
        hours_json=SponsorHours(
            mon=["11:00-22:00"],
            tue=["11:00-22:00"],
            wed=["11:00-22:00"],
            thu=["11:00-22:00"],
            fri=["11:00-23:00"],
            sat=["11:00-23:00"],
            sun=["11:00-21:00"],
        ),
        promo_code="TACO20",
        promo_text="20% off one entree item",
        about="High-traffic taco spot right by campus and downtown nightlife.",
        hero_photo_url="https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=1400&q=80",
        is_active=True,
        billing_plan="semester_50",
        billing_status="paid",
        semester_start="2026-09-01",
        semester_end="2026-12-20",
        priority_score=78,
    ),
    Sponsor(
        id="stuff-yer-face",
        name="Stuff Yer Face",
        category="Restaurant",
        address="49 Easton Ave, New Brunswick, NJ 08901",
        latitude=40.49772,
        longitude=-74.44498,
        phone="(732) 247-1727",
        website_url="https://www.stuffyerface.com/",
        hours_json=SponsorHours(
            mon=["11:30-22:00"],
            tue=["11:30-22:00"],
            wed=["11:30-22:00"],
            thu=["11:30-23:00"],
            fri=["11:30-00:00"],
            sat=["11:30-00:00"],
            sun=["12:00-21:00"],
        ),
        promo_code="PANZO50",
        promo_text="50% off one panzo order",
        about="Well-known Rutgers favorite for panzos and late-night hangs.",
        hero_photo_url="https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1400&q=80",
        is_active=True,
        billing_plan="semester_50",
        billing_status="paid",
        semester_start="2026-09-01",
        semester_end="2026-12-20",
        priority_score=74,
    ),
]

_SPONSOR_EVENTS: list[dict] = []
_NOTIFICATION_SENT_PER_SESSION: set[tuple[str, str]] = set()
_NOTIFICATION_SENT_PER_DAY: defaultdict[tuple[str, str], int] = defaultdict(int)
_NOTIFICATION_LAST_PER_VENUE: dict[tuple[str, str], datetime] = {}


@router.get("", response_model=SponsorListResponse)
async def list_sponsors(
    latitude: Annotated[float | None, Query()] = None,
    longitude: Annotated[float | None, Query()] = None,
    _: Annotated[object, Depends(get_current_user)] = None,
):
    sponsors = [s.model_copy() for s in _SPONSORS if s.is_active]
    if latitude is not None and longitude is not None:
        for sponsor in sponsors:
            sponsor.distance_meters = _distance_meters(
                latitude, longitude, sponsor.latitude, sponsor.longitude
            )
        sponsors.sort(
            key=lambda item: (item.distance_meters if item.distance_meters is not None else 1e12)
        )
    else:
        sponsors.sort(key=lambda item: item.priority_score, reverse=True)
    return {"sponsors": sponsors}


@router.post("/events")
async def track_sponsor_event(
    body: SponsorEventRequest,
    current_user=Depends(get_current_user),
):
    if body.event_type.strip() == "":
        raise HTTPException(status_code=400, detail="event_type is required")
    sponsor_exists = any(s.id == body.sponsor_id and s.is_active for s in _SPONSORS)
    if not sponsor_exists:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    _SPONSOR_EVENTS.append(
        {
            "user_id": str(current_user.id),
            "sponsor_id": body.sponsor_id,
            "event_type": body.event_type.strip().lower(),
            "session_id": body.session_id,
            "metadata": body.metadata or {},
            "at": datetime.now(UTC),
        }
    )
    return {"success": True}


@router.get("/report", response_model=SponsorReportResponse)
async def sponsor_report(_: Annotated[object, Depends(get_current_user)] = None):
    counts: defaultdict[tuple[str, str], int] = defaultdict(int)
    for event in _SPONSOR_EVENTS:
        key = (str(event["sponsor_id"]), str(event["event_type"]))
        counts[key] += 1
    return {
        "events": [
            {"sponsor_id": sponsor_id, "event_type": event_type, "count": count}
            for (sponsor_id, event_type), count in sorted(counts.items())
        ]
    }


@router.get("/nearby-candidate", response_model=SponsorNotificationCandidate)
async def nearby_notification_candidate(
    latitude: float = Query(...),
    longitude: float = Query(...),
    session_id: str = Query(...),
    radius_meters: int = Query(default=400, ge=100, le=1200),
    current_user=Depends(get_current_user),
):
    user_id = str(current_user.id)
    today_key = (user_id, datetime.now(UTC).date().isoformat())
    if _NOTIFICATION_SENT_PER_DAY[today_key] >= 2:
        return {"sponsor": None, "notification_text": None, "blocked_reason": "daily_cap_reached"}
    if (user_id, session_id) in _NOTIFICATION_SENT_PER_SESSION:
        return {"sponsor": None, "notification_text": None, "blocked_reason": "session_cap_reached"}

    now = datetime.now(UTC)
    eligible: list[tuple[float, Sponsor]] = []
    for sponsor in _SPONSORS:
        if not sponsor.is_active:
            continue
        distance = _distance_meters(latitude, longitude, sponsor.latitude, sponsor.longitude)
        if distance > radius_meters:
            continue
        venue_key = (user_id, sponsor.id)
        last_seen = _NOTIFICATION_LAST_PER_VENUE.get(venue_key)
        if last_seen and now - last_seen < timedelta(days=7):
            continue
        eligible.append((distance, sponsor))

    if not eligible:
        return {"sponsor": None, "notification_text": None, "blocked_reason": "no_eligible_sponsor"}

    eligible.sort(key=lambda item: (item[0], -item[1].priority_score))
    distance, sponsor = eligible[0]
    rounded_miles = distance / 1609.34
    body = (
        f"Nearby deal: {sponsor.name} is {rounded_miles:.1f} mi away. "
        f"Use {sponsor.promo_code} - {sponsor.promo_text}"
    )

    _NOTIFICATION_SENT_PER_SESSION.add((user_id, session_id))
    _NOTIFICATION_SENT_PER_DAY[today_key] += 1
    _NOTIFICATION_LAST_PER_VENUE[(user_id, sponsor.id)] = now
    _SPONSOR_EVENTS.append(
        {
            "user_id": user_id,
            "sponsor_id": sponsor.id,
            "event_type": "notification_sent",
            "session_id": session_id,
            "metadata": {"radius_meters": radius_meters},
            "at": now,
        }
    )
    sponsor_copy = sponsor.model_copy()
    sponsor_copy.distance_meters = distance
    return {"sponsor": sponsor_copy, "notification_text": body, "blocked_reason": None}


@router.get("/{sponsor_id}", response_model=Sponsor)
async def get_sponsor(sponsor_id: str, _: Annotated[object, Depends(get_current_user)] = None):
    sponsor = next((row for row in _SPONSORS if row.id == sponsor_id and row.is_active), None)
    if sponsor is None:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    return sponsor
