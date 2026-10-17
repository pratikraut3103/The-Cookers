"""OWNER: Dev A (feat/parent-ai)."""

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import family_id
from app.schemas import LANGUAGES, AskAI, AskRequest, AskResponse, ErrorResponse
from app.services import claude, logs, mock
from app.timeutil import kita_today

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=AskResponse, responses={502: {"model": ErrorResponse}})
async def ask(req: AskRequest, family: str | None = Depends(family_id)) -> AskResponse:
    """Answer a parent's question using only the Kita's documents."""
    if get_settings().mock_ai:
        result = mock.ask(req.question)
    else:
        language = LANGUAGES[req.lang]["name"]
        today = kita_today()  # in the user message, not the system prompt, so the prompt cache keeps working
        messages = [{"role": t.role, "content": t.content} for t in req.history]
        messages.append({
            "role": "user",
            "content": (
                f"Today is {today:%A}, {today.isoformat()} (Kita time, Europe/Berlin).\n"
                f"Reply language: {language}\n\n"
                f"<user_question>\n{req.question}\n</user_question>"
            ),
        })
        result = await claude.generate("ask", messages, AskAI)

    query_id = logs.log_query(req.lang, req.question, result.answered_from_documents, family)
    return AskResponse(**result.model_dump(), id=query_id)
