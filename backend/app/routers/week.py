"""OWNER: Dev B (feat/staff-publish).

Today this asks Claude to read the documents. Dev B replaces build_week() with a read from
the announcements store (translations by language), so the board is instant and identical
on every call. Keep the response shape (WeekResponse) unchanged.
"""

from datetime import date

from fastapi import APIRouter, Query

from app.config import get_settings
from app.schemas import LANGUAGES, ErrorResponse, LangCode, WeekAI, WeekResponse
from app.services import cache, claude, mock

router = APIRouter(tags=["week"])


def resolve_today(today: date | None) -> date:
    return today or get_settings().demo_today or date.today()


async def build_week(lang: str, day: date) -> WeekResponse:
    key = day.isoformat()
    if cached := cache.get_week(lang, key):
        return cached

    if get_settings().mock_ai:
        result = mock.week()
    else:
        language = LANGUAGES[lang]["name"]
        messages = [{
            "role": "user",
            "content": (
                f"Today is {day:%A}, {key}. Reply language: {language}.\n"
                "List everything parents need to know for the next 7 days."
            ),
        }]
        result = await claude.generate("week", messages, WeekAI)

    items = sorted(result.items, key=lambda i: (i.date is None, i.date or ""))
    response = WeekResponse(items=items, lang=lang, generated_for=key)
    cache.set_week(lang, key, response)
    return response


async def prewarm() -> None:
    """Fill the week cache for the demo languages at startup. Never raises."""
    import logging

    day = resolve_today(None)
    for lang in ("en", "de"):
        try:
            await build_week(lang, day)
        except Exception as e:
            logging.getLogger("kita").warning("Week pre-warm failed for %s: %s", lang, e)


@router.get("/week", response_model=WeekResponse, responses={502: {"model": ErrorResponse}})
async def week(
    lang: LangCode = "en",
    today: date | None = Query(default=None, description="Override today's date (YYYY-MM-DD) for demos"),
) -> WeekResponse:
    """This week's events, closures, deadlines and things to bring, in the parent's language."""
    return await build_week(lang, resolve_today(today))
