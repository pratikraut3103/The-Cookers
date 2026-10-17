"""The only place that talks to the Anthropic API.

We call `messages.create` with a JSON-schema output format and validate the reply ourselves
(instead of `messages.parse`), so we can look at `stop_reason` first: a refusal or a truncated
reply has no valid JSON, and must not be mistaken for a model that "wrote bad output".
"""

import logging
import time
from typing import TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.errors import AIError
from app.services.prompts import system_prompt

log = logging.getLogger("kita")

T = TypeVar("T", bound=BaseModel)

MAX_TOKENS = 8000  # adaptive thinking tokens count too; 4000 is tight for long answers
ATTEMPTS = 2  # one retry when the reply is not valid JSON for our schema

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        settings = get_settings()
        key = settings.anthropic_api_key or None  # None -> SDK reads env / ant profile
        headers = {"anthropic-workspace-id": settings.anthropic_workspace_id} if settings.anthropic_workspace_id else None
        _client = anthropic.AsyncAnthropic(api_key=key, timeout=60.0, max_retries=2, default_headers=headers)
    return _client


async def generate(prompt_name: str, messages: list[dict], output: type[T]) -> T:
    """Call Claude with a cached system prompt and return the reply validated as `output`.

    Raises AIError("ai_unavailable") when the API fails or refuses, and
    AIError("ai_bad_output") when the reply is truncated or still invalid after one retry.
    """
    settings = get_settings()
    system = [{
        "type": "text",
        "text": system_prompt(prompt_name),
        "cache_control": {"type": "ephemeral"},
    }]
    output_config = {
        "effort": "low",
        "format": {"type": "json_schema", "schema": anthropic.transform_schema(output)},
    }

    for attempt in range(1, ATTEMPTS + 1):
        start = time.perf_counter()
        try:
            response = await get_client().messages.create(
                model=settings.model,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=messages,
                output_config=output_config,
            )
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as e:
            raise AIError("ai_unavailable", f"{type(e).__name__}: {e}") from e
        except TypeError as e:
            if "authentication" not in str(e).lower():  # only the SDK's "no credentials" error
                raise
            raise AIError(
                "ai_unavailable",
                "No Claude credentials: put ANTHROPIC_API_KEY in backend/.env (or set MOCK_AI=true)",
            ) from e

        u = response.usage
        log.info(
            "%s ok in %.1fs req=%s stop=%s in=%s cache_read=%s cache_write=%s out=%s",
            prompt_name, time.perf_counter() - start, response._request_id, response.stop_reason,
            u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, u.output_tokens,
        )

        if response.stop_reason == "refusal":
            raise AIError("ai_unavailable", f"{prompt_name}: model refused")
        if response.stop_reason == "max_tokens":  # a retry with the same limit would be cut off again
            raise AIError("ai_bad_output", f"{prompt_name}: reply cut off at {MAX_TOKENS} tokens")

        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            return output.model_validate_json(text)
        except ValidationError as e:
            log.warning("%s attempt %d: invalid output: %s", prompt_name, attempt, e)

    raise AIError("ai_bad_output", f"{prompt_name}: could not parse model output")
