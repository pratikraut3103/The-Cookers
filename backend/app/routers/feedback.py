"""The 👍 / 👎 buttons under an answer."""

from fastapi import APIRouter

from app.errors import NotFound
from app.schemas import ErrorResponse, FeedbackRequest, Ok
from app.services import logs

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=Ok, responses={404: {"model": ErrorResponse}})
async def feedback(req: FeedbackRequest) -> Ok:
    """Store whether an answer was helpful. `query_id` is the `id` returned by /ask."""
    if not logs.add_feedback(req.query_id, req.helpful):
        raise NotFound("Unknown answer.")
    return Ok()
