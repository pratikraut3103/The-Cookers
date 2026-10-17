"""Translate a German staff announcement into every supported language (one Claude call)."""

import json

from app.config import get_settings
from app.schemas import LANGUAGES, AnnouncementIn, Translation, TranslationsAI
from app.services import claude
from app.services.announcements import as_dict


def mock_translations(body: AnnouncementIn) -> dict[str, Translation]:
    """Deterministic fake translations for MOCK_AI=true and for tests."""
    return {
        lang: Translation(
            title=f"[{lang}] {body.title}",
            message=f"[{lang}] {body.message}" if body.message else "",
            bring=[f"[{lang}] {item}" for item in body.bring],
            cultural_note=None,
        )
        for lang in LANGUAGES
    }


async def translate(body: AnnouncementIn) -> dict[str, Translation]:
    """Return {lang: Translation} for every language in LANGUAGES (en, de). Raises AIError if Claude fails."""
    if get_settings().mock_ai:
        return mock_translations(body)

    # Only the fields that need translating go to Claude; dates and times stay out of the prompt.
    payload = {"type": body.type, "title": body.title, "message": body.message, "bring": body.bring}
    messages = [{
        "role": "user",
        "content": f"<announcement>\n{json.dumps(payload, ensure_ascii=False)}\n</announcement>",
    }]
    result = await claude.generate("translate_announcement", messages, TranslationsAI)
    return as_dict(result)
