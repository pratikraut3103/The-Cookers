"""The parent's "This week" board, read from the announcements store.

No Claude call happens here: translations were made when staff published, so the board is
instant and identical on every request. Language fallback: requested language -> English ->
the German original.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.config import get_settings
from app.schemas import AnnouncementOut, LangCode, Translation, WeekItem, WeekResponse
from app.services import announcements
from app.timeutil import kita_today

router = APIRouter(tags=["week"])

WINDOW_DAYS = 7  # today plus the next six days
NEW_FOR = timedelta(hours=48)


def resolve_today(today: date | None) -> date:
    return today or kita_today()


def item_date(a: AnnouncementOut) -> date | None:
    """The date shown on the board. Recurring items have none."""
    if a.recurring:
        return None
    if a.type == "deadline" and a.deadline_on:
        return a.deadline_on
    return a.starts_on


def pick_translation(a: AnnouncementOut, lang: str) -> Translation:
    if lang in a.translations:
        return a.translations[lang]
    if "en" in a.translations:
        return a.translations["en"]
    return Translation(title=a.title, message=a.message, bring=a.bring)


def build_week(lang: str, day: date) -> WeekResponse:
    last_day = day + timedelta(days=WINDOW_DAYS - 1)
    new_after = datetime.now(timezone.utc) - NEW_FOR

    items = []
    for a in announcements.list_all():
        shown = item_date(a)
        if shown is not None and not (day <= shown <= last_day):
            continue
        t = pick_translation(a, lang)
        items.append(WeekItem(
            id=a.id, type=a.type, title=t.title,
            date=shown.isoformat() if shown else None, time=a.time,
            message=t.message or None, bring=t.bring, cultural_note=t.cultural_note,
            is_new=datetime.fromisoformat(a.published_at) >= new_after,
            recurring=a.recurring,
        ))

    items.sort(key=lambda i: (i.date is None, i.date or "", i.time or ""))  # dated first, recurring last
    return WeekResponse(items=items, lang=lang, generated_for=day.isoformat())


async def prewarm() -> None:
    """Kept because app.main calls it at startup. Reads are cheap now, so nothing to warm."""
    return None


@router.get("/week", response_model=WeekResponse)
async def week(
    lang: LangCode = "en",
    today: date | None = Query(default=None, description="Override today's date (YYYY-MM-DD) for demos"),
) -> WeekResponse:
    """This week's events, closures, deadlines and things to bring, in the parent's language."""
    return build_week(lang, resolve_today(today))
