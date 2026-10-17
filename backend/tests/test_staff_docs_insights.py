"""Dev C acceptance tests (feat/staff-docs-insights). Red until the stubs are implemented."""

import shutil

import pytest

from app.config import get_settings
from app.services import prompts
from app.services.documents import documents_block

API = "/api/v1"


@pytest.fixture
def tmp_docs(monkeypatch, tmp_path):
    """A throwaway copy of the document pack, so tests never touch the real files."""
    target = tmp_path / "docs"
    shutil.copytree(get_settings().data_dir, target)
    monkeypatch.setattr(get_settings(), "data_dir", target)
    prompts.invalidate()
    return target


# ---------- documents ----------

def test_list_documents(client, staff, tmp_docs):
    docs = client.get(f"{API}/staff/documents", headers=staff).json()
    names = {d["name"] for d in docs}
    assert {"house-rules.md", "calendar.md", "letters/laternenfest.md"} <= names
    assert all(d["title"] and d["size"] > 0 and d["updated_at"] for d in docs)


def test_get_document(client, staff, tmp_docs):
    r = client.get(f"{API}/staff/documents/letters/laternenfest.md", headers=staff)
    assert r.status_code == 200
    assert r.json()["name"] == "letters/laternenfest.md"
    assert "Laternenfest" in r.json()["content"]


def test_get_unknown_document(client, staff, tmp_docs):
    r = client.get(f"{API}/staff/documents/nope.md", headers=staff)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_put_updates_what_ask_uses(client, staff, tmp_docs):
    r = client.put(f"{API}/staff/documents/house-rules.md", headers=staff,
                   json={"content": "# Hausordnung\n\n## §4 Krankheit\nNach Fieber 48 Stunden zuhause bleiben."})
    assert r.status_code == 200
    assert "48 Stunden" in documents_block()  # prompt cache was invalidated
    assert "48 Stunden" in (tmp_docs / "house-rules.md").read_text(encoding="utf-8")


def test_put_creates_new_document(client, staff, tmp_docs):
    r = client.put(f"{API}/staff/documents/letters/fotograf.md", headers=staff,
                   json={"content": "# Fotograf\nAm 20. November kommt der Fotograf."})
    assert r.status_code == 200
    names = {d["name"] for d in client.get(f"{API}/staff/documents", headers=staff).json()}
    assert "letters/fotograf.md" in names


def test_put_rejects_wrong_extension(client, staff, tmp_docs):
    r = client.put(f"{API}/staff/documents/notes.txt", headers=staff, json={"content": "x"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_put_rejects_empty_content(client, staff, tmp_docs):
    r = client.put(f"{API}/staff/documents/house-rules.md", headers=staff, json={"content": ""})
    assert r.status_code == 422


# ---------- insights ----------

def test_insights_counts(client, staff):
    ask = f"{API}/ask"
    client.post(ask, json={"question": "fever?", "lang": "en"}, headers={"X-Family-Id": "a"})
    client.post(ask, json={"question": "fever?", "lang": "en"}, headers={"X-Family-Id": "a"})
    client.post(ask, json={"question": "Can he bring his own lunch?", "lang": "de"}, headers={"X-Family-Id": "b"})

    body = client.get(f"{API}/staff/insights", headers=staff).json()
    assert body["questions_this_week"] == 3
    assert body["families"] == 2
    assert {"lang": "en", "count": 1} in body["languages"]
    assert {"lang": "de", "count": 1} in body["languages"]
    assert body["top_questions"][0] == {"text": "fever?", "count": 2}
    assert body["unanswered"] == [{"text": "Can he bring his own lunch?", "count": 1}]


def test_insights_empty(client, staff):
    body = client.get(f"{API}/staff/insights", headers=staff).json()
    assert body == {"families": 0, "questions_this_week": 0, "languages": [],
                    "top_questions": [], "unanswered": []}


# ---------- path safety and write behaviour ----------

@pytest.mark.parametrize("bad", [
    "", "x.txt", "../x.md", "a/../../x.md", "/etc/x.md", "a\b.md", ".hidden.md",
    "a/b/c.md", "c:x.md", "foo:bar.md", "..", "a//b.md", "letters/.md",
])
def test_safe_path_rejects_bad_names(bad, tmp_docs):
    from app.errors import InvalidRequest
    from app.services import documents

    with pytest.raises(InvalidRequest):
        documents.safe_path(bad)


@pytest.mark.parametrize("good", ["house-rules.md", "letters/laternenfest.md", "Elternbrief 2.md", "über.md"])
def test_safe_path_accepts_normal_names(good, tmp_docs):
    from app.services import documents

    assert documents.safe_path(good).is_relative_to(tmp_docs.resolve())


def test_write_is_clean(client, staff, tmp_docs):
    client.put(f"{API}/staff/documents/notes.md", headers=staff, json={"content": "# Notizen\r\nZeile 1\r\nZeile 2"})
    assert not list(tmp_docs.rglob("*.tmp"))  # temp file was moved into place
    assert "\r" not in (tmp_docs / "notes.md").read_text(encoding="utf-8")
    docs = {d["name"]: d for d in client.get(f"{API}/staff/documents", headers=staff).json()}
    assert docs["notes.md"]["title"] == "Notizen"


def test_traversal_attempt_over_http_writes_nothing(client, staff, tmp_docs):
    r = client.put(f"{API}/staff/documents/..%2Fevil.md", headers=staff, json={"content": "x"})
    assert r.status_code in (404, 422)
    assert not (tmp_docs.parent / "evil.md").exists()


def test_title_falls_back_to_file_name(client, staff, tmp_docs):
    client.put(f"{API}/staff/documents/plain.md", headers=staff, json={"content": "no heading here"})
    docs = {d["name"]: d for d in client.get(f"{API}/staff/documents", headers=staff).json()}
    assert docs["plain.md"]["title"] == "plain"


def test_insights_do_not_expose_family_ids(client, staff):
    client.post(f"{API}/ask", json={"question": "fever?"}, headers={"X-Family-Id": "secret-family-id"})
    assert "secret-family-id" not in client.get(f"{API}/staff/insights", headers=staff).text
