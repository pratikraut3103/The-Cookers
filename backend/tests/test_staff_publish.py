"""Dev B acceptance tests (feat/staff-publish). Red until the stubs are implemented."""

API = "/api/v1"
LANGS = {"en", "ar", "uk", "tr", "es"}

NEW = {
    "type": "event",
    "title": "Sommerfest",
    "message": "Wir feiern am Freitag.",
    "starts_on": "2026-11-05",
    "time": "16:00",
    "bring": ["Kuchen"],
}


def publish(client, staff, body=None):
    r = client.post(f"{API}/staff/announcements", json=body or NEW, headers=staff)
    assert r.status_code == 201, r.text
    return r.json()


def test_publish_translates_to_all_languages(client, staff):
    ann = publish(client, staff)
    assert ann["title"] == "Sommerfest"
    assert set(ann["translations"]) == LANGS
    assert all(t["title"] for t in ann["translations"].values())


def test_list_returns_published(client, staff):
    ann = publish(client, staff)
    ids = [a["id"] for a in client.get(f"{API}/staff/announcements", headers=staff).json()]
    assert ann["id"] in ids


def test_published_item_appears_in_week_in_parent_language(client, staff):
    ann = publish(client, staff)
    week = client.get(f"{API}/week", params={"lang": "ar", "today": "2026-11-04"}).json()
    item = next(i for i in week["items"] if i["id"] == ann["id"])
    assert item["title"] == ann["translations"]["ar"]["title"]
    assert item["date"] == "2026-11-05"
    assert item["is_new"] is True


def test_week_only_shows_next_seven_days(client, staff):
    ann = publish(client, staff, {**NEW, "starts_on": "2026-12-24"})
    week = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-04"}).json()
    assert ann["id"] not in [i["id"] for i in week["items"]]


def test_seed_makes_week_non_empty(client):
    week = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-04"}).json()
    assert len(week["items"]) > 0
    assert any(i["recurring"] == "daily" for i in week["items"])  # the Matschhose reminder


def test_preview_does_not_save(client, staff):
    before = len(client.get(f"{API}/staff/announcements", headers=staff).json())
    r = client.post(f"{API}/staff/announcements/preview", json=NEW, headers=staff)
    assert r.status_code == 200
    assert set(r.json()["translations"]) == LANGS
    after = len(client.get(f"{API}/staff/announcements", headers=staff).json())
    assert before == after


def test_update_retranslates(client, staff):
    ann = publish(client, staff)
    r = client.put(f"{API}/staff/announcements/{ann['id']}", json={**NEW, "title": "Herbstfest"}, headers=staff)
    assert r.status_code == 200
    assert r.json()["title"] == "Herbstfest"
    assert set(r.json()["translations"]) == LANGS


def test_delete(client, staff):
    ann = publish(client, staff)
    assert client.delete(f"{API}/staff/announcements/{ann['id']}", headers=staff).json() == {"ok": True}
    ids = [a["id"] for a in client.get(f"{API}/staff/announcements", headers=staff).json()]
    assert ann["id"] not in ids


def test_delete_unknown_is_404(client, staff):
    r = client.delete(f"{API}/staff/announcements/9999", headers=staff)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_publish_failure_saves_nothing(client, staff, monkeypatch):
    """If translation fails, no half-published item may exist."""
    from app.config import get_settings
    from app.errors import AIError
    from app.services import claude

    monkeypatch.setattr(get_settings(), "mock_ai", False)

    async def boom(*args, **kwargs):
        raise AIError("ai_unavailable", "test")

    monkeypatch.setattr(claude, "generate", boom)
    before = len(client.get(f"{API}/staff/announcements", headers=staff).json())
    r = client.post(f"{API}/staff/announcements", json=NEW, headers=staff)
    assert r.status_code == 502
    after = len(client.get(f"{API}/staff/announcements", headers=staff).json())
    assert before == after


# ---------- behaviour beyond the acceptance tests ----------

def test_publish_requires_a_date_unless_recurring(client, staff):
    r = client.post(f"{API}/staff/announcements", json={"type": "event", "title": "Sommerfest"}, headers=staff)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_changing_only_the_date_does_not_call_claude(client, staff, monkeypatch):
    from app.services import translate

    ann = publish(client, staff)

    async def boom(*args, **kwargs):
        raise AssertionError("translate must not run when the German text is unchanged")

    monkeypatch.setattr(translate, "translate", boom)
    r = client.put(f"{API}/staff/announcements/{ann['id']}", json={**NEW, "starts_on": "2026-11-06"}, headers=staff)
    assert r.status_code == 200
    assert r.json()["starts_on"] == "2026-11-06"
    assert r.json()["translations"] == ann["translations"]  # kept as they were


def test_update_unknown_is_404_without_calling_claude(client, staff, monkeypatch):
    from app.services import translate

    async def boom(*args, **kwargs):
        raise AssertionError("translate must not run for an unknown id")

    monkeypatch.setattr(translate, "translate", boom)
    r = client.put(f"{API}/staff/announcements/9999", json=NEW, headers=staff)
    assert r.status_code == 404


def test_week_falls_back_to_english_when_language_missing(client):
    """The seed only ships en and ar; Ukrainian parents get the English text, not an empty board."""
    uk = client.get(f"{API}/week", params={"lang": "uk", "today": "2026-11-04"}).json()
    en = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-04"}).json()
    assert [i["title"] for i in uk["items"]] == [i["title"] for i in en["items"]]


def test_week_is_ordered_dated_first_recurring_last(client):
    items = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-04"}).json()["items"]
    assert [i["date"] for i in items] == ["2026-11-04", "2026-11-05", "2026-11-06", None]
    assert items[-1]["recurring"] == "daily"
    assert items[1]["time"] == "17:00" and items[1]["bring"] == ["a homemade lantern"]
    assert all(i["is_new"] is False for i in items)  # the seed was published long ago


def test_week_shows_deadline_on_its_deadline_date(client, staff):
    body = {"type": "deadline", "title": "Formular abgeben", "starts_on": "2026-11-01", "deadline_on": "2026-11-06"}
    ann = publish(client, staff, body)
    items = client.get(f"{API}/week", params={"lang": "en", "today": "2026-11-04"}).json()["items"]
    assert next(i for i in items if i["id"] == ann["id"])["date"] == "2026-11-06"


def test_translate_sends_only_text_to_claude(monkeypatch):
    """Real-mode path with Claude stubbed: dates stay out of the prompt, all 5 languages come back."""
    import asyncio

    from app.config import get_settings
    from app.schemas import AnnouncementIn, Translation, TranslationsAI
    from app.services import claude, translate

    monkeypatch.setattr(get_settings(), "mock_ai", False)
    seen = {}

    async def fake_generate(prompt_name, messages, output):
        seen.update(prompt=prompt_name, content=messages[0]["content"], output=output)
        t = Translation(title="t", message="m", bring=["b"], cultural_note=None)
        return TranslationsAI(en=t, ar=t, uk=t, tr=t, es=t)

    monkeypatch.setattr(claude, "generate", fake_generate)
    body = AnnouncementIn(**NEW)
    result = asyncio.run(translate.translate(body))

    assert set(result) == LANGS
    assert seen["prompt"] == "translate_announcement" and seen["output"] is TranslationsAI
    assert "Sommerfest" in seen["content"] and "<announcement>" in seen["content"]
    assert "2026-11-05" not in seen["content"] and "16:00" not in seen["content"]
