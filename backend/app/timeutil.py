"""Date helpers. The Kita is in Berlin, so "today" is the Berlin date, not the server's."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import get_settings

BERLIN = ZoneInfo("Europe/Berlin")  # needs the `tzdata` package on Windows


def berlin_today() -> date:
    return datetime.now(BERLIN).date()


def kita_today() -> date:
    """Today as the Kita sees it: the pinned DEMO_TODAY when set, otherwise the Berlin date."""
    return get_settings().demo_today or berlin_today()
