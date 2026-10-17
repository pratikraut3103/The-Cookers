"""The "Eltern-Übersicht" screen. The queries live in services/insights.py."""

from fastapi import APIRouter, Depends

from app.auth import require_staff
from app.schemas import ErrorResponse, InsightsResponse
from app.services import insights as insights_service

router = APIRouter(
    prefix="/staff", tags=["staff: insights"],
    dependencies=[Depends(require_staff)],
    responses={401: {"model": ErrorResponse}},
)


@router.get("/insights", response_model=InsightsResponse)
async def insights() -> InsightsResponse:
    """Families, questions this week, languages, top questions, and questions the documents can't answer."""
    return insights_service.compute()
