"""Request/response models. This file IS the API contract with the frontend.

Changes here affect every developer and the frontend team: change it only via a small
PR to `develop` that everyone sees, never inside a feature branch.
"""

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

LangCode = Literal["en", "de"]

# Adding a language later: add it here, add a field to TranslationsAI below, and add its
# translations to data/seed/announcements.json. `rtl` is kept so right-to-left languages
# (e.g. Arabic) can come back without changing the API.
LANGUAGES: dict[str, dict] = {
    "en": {"label": "English", "name": "English", "rtl": False},
    "de": {"label": "Deutsch", "name": "German", "rtl": False},
}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- shared ----------

class Source(Strict):
    document: str = Field(description="File name of the Kita document, e.g. house-rules.md")
    section: str | None = Field(default=None, description="Section or heading, e.g. §4")


class ChatTurn(Strict):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Ok(Strict):
    ok: Literal[True] = True


# ---------- meta ----------

class Health(Strict):
    status: Literal["ok"] = "ok"
    mock_ai: bool


class Language(Strict):
    code: LangCode
    label: str
    rtl: bool


class LanguagesResponse(Strict):
    languages: list[Language]


class KitaInfo(Strict):
    code: str
    name: str
    city: str


# ---------- /ask ----------

class AskRequest(Strict):
    question: str = Field(min_length=1, max_length=1000)
    lang: LangCode = "en"
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class AskAI(Strict):
    """What Claude returns."""
    answer: str
    what_to_do: str | None = None
    cultural_note: str | None = None
    sources: list[Source] = Field(default_factory=list)
    answered_from_documents: bool
    suggest_draft: bool


class AskResponse(AskAI):
    """What the frontend receives: Claude's answer plus the id used for feedback."""
    id: int


class FeedbackRequest(Strict):
    query_id: int
    helpful: bool


# ---------- /draft-message ----------

class DraftRequest(Strict):
    text: str = Field(min_length=1, max_length=1000)
    lang: LangCode = "en"
    child_name: str | None = Field(default=None, max_length=60)
    parent_name: str | None = Field(default=None, max_length=60)


class DraftAI(Strict):
    german_message: str
    back_translation: str


class DraftResponse(DraftAI):
    lang: LangCode


# ---------- /week ----------

class WeekItem(Strict):
    id: int | None = Field(default=None, description="Announcement id, null for items not from the store")
    type: Literal["event", "closure", "deadline", "reminder"]
    title: str
    date: str | None = Field(default=None, description="YYYY-MM-DD; null for recurring items")
    time: str | None = Field(default=None, description="HH:MM, 24h")
    message: str | None = None
    bring: list[str] = Field(default_factory=list)
    cultural_note: str | None = None
    is_new: bool = Field(default=False, description="Published in the last 48 hours")
    recurring: Literal["daily"] | None = None
    source: Source | None = None


class WeekAI(Strict):
    items: list[WeekItem]


class WeekResponse(WeekAI):
    lang: LangCode
    generated_for: str


# ---------- staff: auth ----------

class LoginRequest(Strict):
    code: str = Field(min_length=1, max_length=40)


class LoginResponse(Strict):
    token: str


# ---------- staff: announcements ----------

AnnouncementType = Literal["event", "closure", "deadline", "reminder"]


class AnnouncementIn(Strict):
    """Written by staff in German."""
    type: AnnouncementType
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(default="", max_length=1000)
    starts_on: Date | None = Field(default=None, description="Null only when recurring")
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    deadline_on: Date | None = None
    bring: list[str] = Field(default_factory=list, max_length=10)
    recurring: Literal["daily"] | None = None

    @model_validator(mode="after")
    def date_required_unless_recurring(self):
        if self.recurring is None and self.starts_on is None:
            raise ValueError("starts_on is required unless the announcement is recurring")
        return self


class Translation(Strict):
    title: str
    message: str
    bring: list[str] = Field(default_factory=list)
    cultural_note: str | None = None


class TranslationsAI(Strict):
    """What Claude returns when translating an announcement: one entry per language."""
    en: Translation
    de: Translation


class AnnouncementOut(AnnouncementIn):
    id: int
    published_at: str
    translations: dict[str, Translation]


class PreviewResponse(Strict):
    translations: dict[str, Translation]


# ---------- staff: documents ----------

class DocumentInfo(Strict):
    name: str = Field(description="Path relative to the Kita data folder, e.g. letters/laternenfest.md")
    title: str
    updated_at: str
    size: int


class DocumentContent(Strict):
    name: str
    content: str


class DocumentWrite(Strict):
    content: str = Field(min_length=1, max_length=20000)


# ---------- staff: insights ----------

class LanguageCount(Strict):
    lang: str
    count: int


class QuestionCount(Strict):
    text: str
    count: int


class InsightsResponse(Strict):
    families: int = Field(description="Distinct anonymous family ids that asked something")
    questions_this_week: int
    languages: list[LanguageCount]
    top_questions: list[QuestionCount]
    unanswered: list[QuestionCount]


# ---------- errors ----------

class ErrorBody(Strict):
    code: Literal[
        "invalid_request", "unauthorized", "not_found", "not_implemented",
        "ai_unavailable", "ai_bad_output", "internal_error",
    ]
    message: str


class ErrorResponse(Strict):
    error: ErrorBody
