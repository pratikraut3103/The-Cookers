"""Foundation contract tests (should always be green on `develop`)."""

import pytest

from app.config import get_settings
from app.errors import AIError
from app.services import claude
from app.services.documents import documents_block

API = "/api/v1"


def test_health(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "mock_ai": True}


def test_languages(client):
    langs = client.get(f"{API}/languages").json()["languages"]
    assert {l["code"] for l in langs} == {"en", "de"}
    assert next(l for l in langs if l["code"] == "de")["label"] == "Deutsch"
    assert all(l["rtl"] is False for l in langs)


def test_ask_shape(client):
    r = client.post(f"{API}/ask", json={"question": "My son has a fever, can he go?", "lang": "en"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"id", "answer", "what_to_do", "cultural_note", "sources",
                         "answered_from_documents", "suggest_draft"}
    assert isinstance(body["id"], int)
    assert body["sources"][0]["document"] == "house-rules.md"


def test_ask_unknown_suggests_teacher(client):
    body = client.post(f"{API}/ask", json={"question": "What is the WiFi password?"}).json()
    assert body["answered_from_documents"] is False
    assert body["suggest_draft"] is True


def test_draft_message(client):
    r = client.post(f"{API}/draft-message", json={"text": "Yusuf will be late", "lang": "en"})
    assert r.status_code == 200
    assert set(r.json()) == {"german_message", "back_translation", "lang"}
    assert r.json()["lang"] == "en"


@pytest.mark.parametrize("lang", ["ar", "uk", "tr", "es", "xx"])
def test_removed_languages_are_rejected(client, lang):
    r = client.post(f"{API}/ask", json={"question": "fever?", "lang": lang})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_week(client):
    r = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-11"})
    assert r.status_code == 200
    body = r.json()
    assert body["generated_for"] == "2026-11-11"
    dates = [i["date"] for i in body["items"] if i["date"]]
    assert dates == sorted(dates)


@pytest.mark.parametrize("path,payload", [
    (f"{API}/ask", {"question": ""}),
    (f"{API}/ask", {"question": "hi", "lang": "xx"}),
    (f"{API}/draft-message", {}),
])
def test_invalid_request(client, path, payload):
    r = client.post(path, json=payload)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_ai_failure_is_friendly(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "mock_ai", False)

    async def boom(*args, **kwargs):
        raise AIError("ai_unavailable", "test")

    monkeypatch.setattr(claude, "generate", boom)
    r = client.post(f"{API}/ask", json={"question": "hi"})
    assert r.status_code == 502
    assert r.json()["error"] == {
        "code": "ai_unavailable",
        "message": "Something went wrong, please try again in a moment.",
    }


def test_documents_loaded_and_sorted():
    block = documents_block()
    assert '<document name="house-rules.md">' in block
    assert block.index("calendar.md") < block.index("house-rules.md") < block.index("letters/")


# ---------- staff auth (foundation) ----------

def test_login_ok(client):
    r = client.post(f"{API}/staff/login", json={"code": "sonne"})
    assert r.status_code == 200
    assert r.json()["token"]


def test_login_wrong_code(client):
    r = client.post(f"{API}/staff/login", json={"code": "NOPE"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("path", ["/staff/announcements", "/staff/documents", "/staff/insights"])
def test_staff_routes_need_token(client, path):
    r = client.get(f"{API}{path}")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_ask_is_logged_with_family(client):
    from app.db import connect

    client.post(f"{API}/ask", json={"question": "fever?"}, headers={"X-Family-Id": "fam-1"})
    with connect() as c:
        row = c.execute("SELECT family_id, answered_from_documents FROM query_log").fetchone()
    assert (row["family_id"], row["answered_from_documents"]) == ("fam-1", 1)


# ---------- announcement input rules (foundation) ----------

def test_announcement_needs_a_date_unless_recurring():
    from pydantic import ValidationError

    from app.schemas import AnnouncementIn

    with pytest.raises(ValidationError):
        AnnouncementIn(type="event", title="Sommerfest")
    AnnouncementIn(type="event", title="Sommerfest", starts_on="2026-11-12")
    AnnouncementIn(type="reminder", title="Matschhose", recurring="daily")


@pytest.mark.parametrize("bad", ["24:00", "9:30", "12:60", "noon"])
def test_announcement_time_must_be_hh_mm(bad):
    from pydantic import ValidationError

    from app.schemas import AnnouncementIn

    with pytest.raises(ValidationError):
        AnnouncementIn(type="event", title="x", starts_on="2026-11-12", time=bad)


def test_berlin_today_is_a_date():
    from datetime import date

    from app.timeutil import berlin_today

    assert isinstance(berlin_today(), date)
