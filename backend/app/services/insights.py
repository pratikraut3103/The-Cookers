"""Anonymous numbers for the staff "Eltern-Übersicht". Plain SQL over query_log, no Claude.

Nothing here can identify a family: family_id is only counted, never returned.
"""

from datetime import datetime, timedelta, timezone

from app.db import connect
from app.schemas import InsightsResponse, LanguageCount, QuestionCount

TOP_N = 5


def compute() -> InsightsResponse:
    # Same format as logs.now_iso(), so comparing the ISO strings compares the times.
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec="seconds")
    with connect() as conn:
        families = conn.execute(
            "SELECT COUNT(DISTINCT family_id) FROM query_log WHERE family_id IS NOT NULL"
        ).fetchone()[0]
        this_week = conn.execute(
            "SELECT COUNT(*) FROM query_log WHERE asked_at >= ?", (week_ago,)
        ).fetchone()[0]
        languages = conn.execute(
            "SELECT lang, COUNT(DISTINCT family_id) AS n FROM query_log"
            " WHERE family_id IS NOT NULL GROUP BY lang ORDER BY n DESC, lang"
        ).fetchall()
        top = conn.execute(
            "SELECT question AS text, COUNT(*) AS n FROM query_log"
            " GROUP BY question ORDER BY n DESC, text LIMIT ?", (TOP_N,)
        ).fetchall()
        unanswered = conn.execute(
            "SELECT question AS text, COUNT(*) AS n FROM query_log"
            " WHERE answered_from_documents = 0 GROUP BY question ORDER BY n DESC, text LIMIT ?", (TOP_N,)
        ).fetchall()

    return InsightsResponse(
        families=families,
        questions_this_week=this_week,
        languages=[LanguageCount(lang=r["lang"], count=r["n"]) for r in languages],
        top_questions=[QuestionCount(text=r["text"], count=r["n"]) for r in top],
        unanswered=[QuestionCount(text=r["text"], count=r["n"]) for r in unanswered],
    )
