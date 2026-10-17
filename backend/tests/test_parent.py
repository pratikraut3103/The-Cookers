"""Dev A acceptance tests (feat/parent-ai). Red until the stubs are implemented."""

API = "/api/v1"


def test_kita_lookup(client):
    r = client.get(f"{API}/kitas/SONNE")
    assert r.status_code == 200
    assert r.json() == {"code": "SONNE", "name": "Kita Sonnenblume", "city": "Berlin"}


def test_kita_lookup_is_case_insensitive(client):
    assert client.get(f"{API}/kitas/sonne").status_code == 200


def test_kita_unknown_code(client):
    r = client.get(f"{API}/kitas/NOPE")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_feedback_roundtrip(client):
    answer = client.post(f"{API}/ask", json={"question": "fever?"}).json()
    r = client.post(f"{API}/feedback", json={"query_id": answer["id"], "helpful": True})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_feedback_unknown_query(client):
    r = client.post(f"{API}/feedback", json={"query_id": 9999, "helpful": False})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_supported_languages_accepted(client):
    for lang in ("en", "de"):
        assert client.post(f"{API}/ask", json={"question": "fever?", "lang": lang}).status_code == 200
        assert client.post(f"{API}/draft-message", json={"text": "late", "lang": lang}).status_code == 200
        assert client.get(f"{API}/week", params={"lang": lang}).status_code == 200


def test_draft_accepts_names(client):
    r = client.post(f"{API}/draft-message", json={
        "text": "Yusuf will be late tomorrow", "lang": "en",
        "child_name": "Yusuf", "parent_name": "Amira",
    })
    assert r.status_code == 200


def test_eval_questions_file_is_valid():
    import json
    from pathlib import Path

    questions = json.loads((Path(__file__).parent / "eval_questions.json").read_text(encoding="utf-8"))
    assert len(questions) == 10
    assert sum(q["expected_source"] is None for q in questions) >= 3  # questions the pack does not cover
    assert all({"question", "lang", "expected_source"} == set(q) for q in questions)


def test_eval_verdict_marks():
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "eval_questions", Path(__file__).parent.parent / "scripts" / "eval_questions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    cited = {"answered_from_documents": True, "sources": [{"document": "house-rules.md", "section": "§4"}]}
    refused = {"answered_from_documents": False, "sources": []}
    assert module.verdict("house-rules.md", cited).strip() == "PASS"
    assert module.verdict("calendar.md", cited).strip() == "CHECK"
    assert module.verdict(None, refused).strip() == "PASS"
    assert module.verdict(None, cited).strip() == "CHECK"


def test_ask_tells_claude_todays_date(client, monkeypatch):
    """Without the date Claude cannot answer 'what do I bring tomorrow?' (it said it did not know what tomorrow is)."""
    from datetime import date

    from app.config import get_settings
    from app.schemas import AskAI
    from app.services import claude

    seen = {}

    async def fake_generate(prompt_name, messages, output):
        seen["last"] = messages[-1]["content"]
        return AskAI(answer="ok", answered_from_documents=True, suggest_draft=False)

    monkeypatch.setattr(get_settings(), "mock_ai", False)
    monkeypatch.setattr(get_settings(), "demo_today", date(2026, 11, 2))
    monkeypatch.setattr(claude, "generate", fake_generate)
    assert client.post(f"{API}/ask", json={"question": "What do I bring tomorrow?"}).status_code == 200
    assert "Today is Monday, 2026-11-02" in seen["last"]
    assert "<user_question>\nWhat do I bring tomorrow?\n</user_question>" in seen["last"]
