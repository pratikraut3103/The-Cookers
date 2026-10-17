from fastapi import APIRouter

from app.config import get_settings
from app.schemas import LANGUAGES, DraftAI, DraftRequest, DraftResponse, ErrorResponse
from app.services import claude, mock

router = APIRouter(tags=["draft"])


def _user_message(req: DraftRequest) -> str:
    """Per-request text goes in the user message, wrapped in tags, so it stays data."""
    parts = [f"Parent's language: {LANGUAGES[req.lang]['name']}"]
    if req.child_name and req.child_name.strip():
        parts.append(f"<child_name>{req.child_name.strip()}</child_name>")
    if req.parent_name and req.parent_name.strip():
        parts.append(f"<parent_name>{req.parent_name.strip()}</parent_name>")
    parts.append(f"<parent_text>\n{req.text}\n</parent_text>")
    return "\n\n".join(parts)


@router.post("/draft-message", response_model=DraftResponse, responses={502: {"model": ErrorResponse}})
async def draft_message(req: DraftRequest) -> DraftResponse:
    """Turn what the parent wants to say into a polite German message + back-translation."""
    if get_settings().mock_ai:
        result = mock.draft(req.text, req.child_name, req.parent_name)
    else:
        messages = [{"role": "user", "content": _user_message(req)}]
        result = await claude.generate("draft_message", messages, DraftAI)
    return DraftResponse(**result.model_dump(), lang=req.lang)
