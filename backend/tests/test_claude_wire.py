"""Tests of services/claude.py against a fake Anthropic server (no key, no network, no cost).

They pin down what we send (model, cached system prompt, JSON-schema output) and how every
kind of failure is turned into a friendly error.
"""

import asyncio
import json

import anthropic
import httpx2
import pytest

from app.errors import AIError
from app.schemas import DraftAI
from app.services import claude

REPLY = {"german_message": "Guten Tag,\n\nYusuf kommt später.\n\nViele Grüße", "back_translation": "Hello, ..."}


def message(text: str, stop_reason: str = "end_turn", usage_extra: dict | None = None) -> dict:
    return {
        "id": "msg_test", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
        "content": [{"type": "text", "text": text}], "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 100, "output_tokens": 30, **(usage_extra or {})},
    }


def install_fake(monkeypatch, responder):
    """Route the shared Claude client to `responder(call_number, request) -> httpx2.Response`."""
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return responder(len(requests), request)

    client = anthropic.AsyncAnthropic(
        api_key="test-key-not-real", max_retries=0,
        http_client=anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(claude, "_client", client)
    return requests


def generate():
    return asyncio.run(claude.generate("draft_message", [{"role": "user", "content": "hi"}], DraftAI))


def test_request_shape_and_parsing(monkeypatch):
    requests = install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=message(json.dumps(REPLY))))
    result = generate()

    assert result.german_message.startswith("Guten Tag")
    body = requests[0]
    assert body["model"] == "claude-sonnet-5-5"
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}  # documents are prompt-cached
    assert "Kita Sonnenblume" in body["system"][0]["text"]
    assert body["output_config"]["effort"] == "low"
    schema = body["output_config"]["format"]["schema"]
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == {"german_message", "back_translation"}
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert "thinking" not in body  # sonnet-5-5 thinks adaptively by default; a disabled setting would 400


def test_unparseable_reply_is_retried_once_then_reported(monkeypatch):
    requests = install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=message("not json at all")))
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_bad_output"
    assert len(requests) == 2  # one retry, not an endless loop


def test_second_attempt_can_succeed(monkeypatch):
    def responder(n, request):
        return httpx2.Response(200, json=message("{}" if n == 1 else json.dumps(REPLY)))

    requests = install_fake(monkeypatch, responder)
    assert generate().back_translation == "Hello, ..."
    assert len(requests) == 2


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 500, 529])
def test_api_errors_become_ai_unavailable(monkeypatch, status):
    body = {"type": "error", "error": {"type": "api_error", "message": "boom"}}
    install_fake(monkeypatch, lambda n, r: httpx2.Response(status, json=body))
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_unavailable"


def test_network_failure_becomes_ai_unavailable(monkeypatch):
    def responder(n, request):
        raise httpx2.ConnectError("no network", request=request)

    install_fake(monkeypatch, responder)
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_unavailable"


def test_refusal_becomes_ai_unavailable(monkeypatch):
    refusal = message("", stop_reason="refusal")
    refusal["stop_details"] = {"type": "refusal", "category": None, "explanation": None}
    install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=refusal))
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_unavailable"


def test_error_message_never_contains_the_api_key(monkeypatch):
    body = {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}
    install_fake(monkeypatch, lambda n, r: httpx2.Response(401, json=body))
    with pytest.raises(AIError) as err:
        generate()
    assert "test-key-not-real" not in str(err.value) + err.value.detail


def test_whole_endpoint_with_fake_claude(client, monkeypatch):
    """/draft-message in real mode (MOCK_AI=false) end to end, Claude faked at the HTTP layer."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "mock_ai", False)
    requests = install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=message(json.dumps(REPLY))))
    r = client.post("/api/v1/draft-message", json={
        "text": "Yusuf will be late", "lang": "en", "child_name": "Yusuf", "parent_name": "Amira"})
    assert r.status_code == 200
    assert r.json()["german_message"].startswith("Guten Tag")
    user_message = requests[0]["messages"][0]["content"]
    assert "<child_name>Yusuf</child_name>" in user_message and "<parent_name>Amira</parent_name>" in user_message
    assert "Parent's language: English" in user_message


def test_ask_in_real_mode_returns_an_id_and_logs(client, monkeypatch):
    from app.config import get_settings
    from app.db import connect

    monkeypatch.setattr(get_settings(), "mock_ai", False)
    answer = {"answer": "No.", "what_to_do": None, "cultural_note": None,
              "sources": [{"document": "house-rules.md", "section": "§4"}],
              "answered_from_documents": True, "suggest_draft": False}
    install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=message(json.dumps(answer))))
    r = client.post("/api/v1/ask", json={"question": "fever?", "lang": "de"}, headers={"X-Family-Id": "f1"})
    assert r.status_code == 200 and r.json()["id"] >= 1
    with connect() as c:
        row = c.execute("SELECT lang, answered_from_documents, family_id FROM query_log").fetchone()
    assert tuple(row) == ("de", 1, "f1")


def test_truncated_reply_is_reported_without_retry(monkeypatch):
    requests = install_fake(monkeypatch, lambda n, r: httpx2.Response(
        200, json=message('{"german_message": "Guten', stop_reason="max_tokens")))
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_bad_output"
    assert len(requests) == 1  # same limit would cut off again, so no retry


def test_refusal_is_not_retried(monkeypatch):
    refusal = message("", stop_reason="refusal")
    requests = install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=refusal))
    with pytest.raises(AIError):
        generate()
    assert len(requests) == 1


def test_cache_usage_fields_are_read(monkeypatch):
    usage = {"cache_creation_input_tokens": 900, "cache_read_input_tokens": 0}
    install_fake(monkeypatch, lambda n, r: httpx2.Response(200, json=message(json.dumps(REPLY), usage_extra=usage)))
    assert generate().german_message  # logging the cache fields must not break the call


def test_missing_api_key_is_a_clear_ai_unavailable(monkeypatch):
    """No key at all: the SDK raises a bare TypeError; we must report ai_unavailable with a hint."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    client = anthropic.AsyncAnthropic(
        api_key=None, max_retries=0,
        http_client=anthropic.DefaultAsyncHttpxClient(
            transport=httpx2.MockTransport(lambda r: httpx2.Response(401, json={"type": "error", "error": {"type": "authentication_error", "message": "x"}}))),
    )
    monkeypatch.setattr(claude, "_client", client)
    with pytest.raises(AIError) as err:
        generate()
    assert err.value.code == "ai_unavailable"  # either the clear no-credentials error or a 401


def test_other_type_errors_are_not_swallowed(monkeypatch):
    class Boom:
        class messages:
            @staticmethod
            async def create(**kwargs):
                raise TypeError("a genuine bug, unrelated to credentials")

    monkeypatch.setattr(claude, "_client", Boom())
    with pytest.raises(TypeError, match="genuine bug"):
        generate()


def test_workspace_id_header_is_sent_when_configured(monkeypatch):
    """Keys that are not workspace-scoped need the anthropic-workspace-id header."""
    from app.config import get_settings

    seen = {}

    def responder(n, request):
        seen["header"] = request.headers.get("anthropic-workspace-id")
        return httpx2.Response(200, json=message(json.dumps(REPLY)))

    monkeypatch.setattr(get_settings(), "anthropic_workspace_id", "wrk_test123")
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key-not-real")
    monkeypatch.setattr(claude, "_client", None)  # force get_client() to build from settings

    original = anthropic.AsyncAnthropic

    def with_fake_transport(**kwargs):
        kwargs["http_client"] = anthropic.DefaultAsyncHttpxClient(
            transport=httpx2.MockTransport(lambda r: responder(1, r)))
        return original(**kwargs)

    monkeypatch.setattr(claude.anthropic, "AsyncAnthropic", with_fake_transport)
    generate()
    assert seen["header"] == "wrk_test123"
    monkeypatch.setattr(claude, "_client", None)  # don't leak the fake client into other tests
