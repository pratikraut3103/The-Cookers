"""Check that your Claude API key works, with one tiny call. Never prints the key.

    cd backend
    python scripts/check_claude.py

Reads backend/.env (ANTHROPIC_API_KEY, MODEL) like the app does. Uses the same request shape
as the app (JSON-schema output, low effort), so a pass here means /ask and /draft-message can work.
"""

import os
import sys
from pathlib import Path

import anthropic
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402


class Pong(BaseModel):
    ok: bool
    word: str


def main() -> int:
    settings = get_settings()
    key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    print(f"model:      {settings.model}")
    print(f"MOCK_AI:    {settings.mock_ai}" + ("  (the app will NOT call Claude until you set MOCK_AI=false)" if settings.mock_ai else ""))
    print(f"api key:    {'set' if key else 'NOT SET'}")
    print(f"workspace:  {settings.anthropic_workspace_id or '(none: key must be workspace-scoped)'}")
    if not key:
        print("\nPut your key in backend/.env as  ANTHROPIC_API_KEY=...  (the file is git-ignored). "
              "Never paste it into chat, code or commits.")
        return 1

    headers = {"anthropic-workspace-id": settings.anthropic_workspace_id} if settings.anthropic_workspace_id else None
    client = anthropic.Anthropic(api_key=key, timeout=60.0, max_retries=1, default_headers=headers)
    try:
        r = client.messages.create(
            model=settings.model,
            max_tokens=1000,
            messages=[{"role": "user", "content": "Reply with ok=true and the word Kita."}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": anthropic.transform_schema(Pong)}},
        )
    except anthropic.AuthenticationError:
        print("\nFAIL: the API key was rejected (wrong, revoked, or from another organisation).")
    except anthropic.PermissionDeniedError:
        print("\nFAIL: this key has no permission to use this model or workspace.")
    except anthropic.NotFoundError:
        print(f"\nFAIL: model '{settings.model}' was not found for this key.")
    except anthropic.RateLimitError:
        print("\nFAIL: rate limit or credit limit reached. Check the Console for remaining credits.")
    except anthropic.BadRequestError as e:
        print(f"\nFAIL: the API rejected the request: {e.message}")
    except anthropic.APIConnectionError:
        print("\nFAIL: could not reach api.anthropic.com. Check your internet connection.")
    except anthropic.APIStatusError as e:
        print(f"\nFAIL: API error {e.status_code}: {e.message}")
    else:
        text = next((b.text for b in r.content if b.type == "text"), "")
        u = r.usage
        print(f"\nOK: stop={r.stop_reason}, reply={text.strip()}, tokens in/out={u.input_tokens}/{u.output_tokens}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
