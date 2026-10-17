"""Date helpers. The Kita is in Berlin, so "today" is the Berlin date, not the server's."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")  # needs the `tzdata` package on Windows


def berlin_today() -> date:
    return datetime.now(BERLIN).date()
