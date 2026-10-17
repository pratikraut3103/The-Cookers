"""Announcement storage (SQLite): staff announcements plus their per-language translations.

All SQL for announcements lives here. Routers call these functions; they never write SQL.
Every function opens its own `connect()` block, so each call is one transaction: an
announcement and its translations are saved (or replaced) together, never half-way.
"""

import json
import logging
import sqlite3
from collections import defaultdict
from pathlib import Path

from app.config import ROOT_DIR
from app.db import connect
from app.schemas import LANGUAGES, AnnouncementIn, AnnouncementOut, Translation, TranslationsAI
from app.services.logs import now_iso

log = logging.getLogger("kita")

SEED_FILE = ROOT_DIR / "data" / "seed" / "announcements.json"


# ---------- helpers ----------

def as_dict(translations: TranslationsAI) -> dict[str, Translation]:
    """TranslationsAI (one field per language) -> {lang: Translation}."""
    return {lang: getattr(translations, lang) for lang in LANGUAGES}


def _insert_translations(conn: sqlite3.Connection, announcement_id: int, translations: dict[str, Translation]) -> None:
    conn.executemany(
        "INSERT INTO translations (announcement_id, lang, title, message, bring, cultural_note)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        [
            (announcement_id, lang, t.title, t.message, json.dumps(t.bring, ensure_ascii=False), t.cultural_note)
            for lang, t in translations.items()
        ],
    )


def _hydrate(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[AnnouncementOut]:
    """Rows -> AnnouncementOut, loading all translations with one query (no N+1)."""
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    marks = ",".join("?" * len(ids))
    by_announcement: dict[int, dict[str, Translation]] = defaultdict(dict)
    for t in conn.execute(f"SELECT * FROM translations WHERE announcement_id IN ({marks})", ids):  # noqa: S608 (marks is only "?")
        by_announcement[t["announcement_id"]][t["lang"]] = Translation(
            title=t["title"], message=t["message"], bring=json.loads(t["bring"]), cultural_note=t["cultural_note"],
        )
    return [
        AnnouncementOut(
            id=r["id"], type=r["type"], title=r["title"], message=r["message"],
            starts_on=r["starts_on"], time=r["time"], deadline_on=r["deadline_on"],
            bring=json.loads(r["bring"]), recurring=r["recurring"], published_at=r["published_at"],
            translations=by_announcement.get(r["id"], {}),
        )
        for r in rows
    ]


def _scalars(body: AnnouncementIn) -> tuple:
    return (
        body.type, body.title, body.message,
        body.starts_on.isoformat() if body.starts_on else None, body.time,
        body.deadline_on.isoformat() if body.deadline_on else None,
        json.dumps(body.bring, ensure_ascii=False), body.recurring,
    )


# ---------- repository ----------

def create(body: AnnouncementIn, translations: dict[str, Translation], published_at: str | None = None) -> AnnouncementOut:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO announcements (type, title, message, starts_on, time, deadline_on, bring, recurring, published_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (*_scalars(body), published_at or now_iso()),
        )
        _insert_translations(conn, cur.lastrowid, translations)
        row = conn.execute("SELECT * FROM announcements WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _hydrate(conn, [row])[0]


def list_all() -> list[AnnouncementOut]:
    """Newest first."""
    with connect() as conn:
        rows = conn.execute("SELECT * FROM announcements ORDER BY published_at DESC, id DESC").fetchall()
        return _hydrate(conn, rows)


def get(announcement_id: int) -> AnnouncementOut | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM announcements WHERE id = ?", (announcement_id,)).fetchone()
        return _hydrate(conn, [row])[0] if row else None


def same_source(existing: AnnouncementOut, body: AnnouncementIn) -> bool:
    """True when the German text is unchanged, so the translations are still valid.

    Dates and times are not part of a translation, so changing only those needs no Claude call.
    """
    return (existing.type, existing.title, existing.message, existing.bring) == (
        body.type, body.title, body.message, body.bring,
    )


def update(announcement_id: int, body: AnnouncementIn, translations: dict[str, Translation] | None) -> AnnouncementOut | None:
    """Replace an announcement. `translations=None` keeps the existing ones. Returns None if unknown."""
    with connect() as conn:
        row = conn.execute("SELECT id FROM announcements WHERE id = ?", (announcement_id,)).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE announcements SET type = ?, title = ?, message = ?, starts_on = ?, time = ?,"
            " deadline_on = ?, bring = ?, recurring = ? WHERE id = ?",
            (*_scalars(body), announcement_id),
        )
        if translations is not None:
            conn.execute("DELETE FROM translations WHERE announcement_id = ?", (announcement_id,))
            _insert_translations(conn, announcement_id, translations)
        row = conn.execute("SELECT * FROM announcements WHERE id = ?", (announcement_id,)).fetchone()
        return _hydrate(conn, [row])[0]


def delete(announcement_id: int) -> bool:
    with connect() as conn:  # ON DELETE CASCADE removes the translations
        return conn.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,)).rowcount > 0


# ---------- seed ----------

def seed_if_empty(path: Path = SEED_FILE) -> int:
    """Called once at startup. Loads the starter announcements when the table is empty.

    The seed ships ready-made translations (en, de), so it needs no Claude call. Bad seed data
    fails loudly here (validation), not silently on the parent's screen. Returns rows inserted.
    """
    with connect() as conn:
        if conn.execute("SELECT COUNT(*) FROM announcements").fetchone()[0] > 0:
            return 0
    entries = json.loads(path.read_text(encoding="utf-8"))
    for entry in entries:
        translations = {lang: Translation(**t) for lang, t in entry.pop("translations").items()}
        published_at = entry.pop("published_at")
        create(AnnouncementIn(**entry), translations, published_at)
    log.info("Seeded %d announcements", len(entries))
    return len(entries)
