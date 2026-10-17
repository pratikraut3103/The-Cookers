"""OWNER: Dev B (feat/staff-publish). Staff dashboard: write once in German, parents see it
in their language.

Flow for POST (publish):
  1. validate AnnouncementIn
  2. one Claude call -> TranslationsAI (en, de) via claude.generate(...)
  3. only if that succeeded: save the announcement + 5 translations
  4. return AnnouncementOut (so the UI never shows a half-published item)
In MOCK_AI mode, return deterministic fake translations instead of calling Claude.
"""

from fastapi import APIRouter, Depends

from app.auth import require_staff
from app.errors import NotImplementedYet
from app.schemas import AnnouncementIn, AnnouncementOut, ErrorResponse, Ok, PreviewResponse

router = APIRouter(
    prefix="/staff", tags=["staff: announcements"],
    dependencies=[Depends(require_staff)],
    responses={401: {"model": ErrorResponse}},
)


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements() -> list[AnnouncementOut]:
    """Newest first."""
    raise NotImplementedYet("dev-b")


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
async def create_announcement(body: AnnouncementIn) -> AnnouncementOut:
    """Translate and publish."""
    raise NotImplementedYet("dev-b")


@router.post("/announcements/preview", response_model=PreviewResponse)
async def preview_announcement(body: AnnouncementIn) -> PreviewResponse:
    """Translate only (the 'Vorschau für Eltern' modal). Nothing is saved."""
    raise NotImplementedYet("dev-b")


@router.put("/announcements/{announcement_id}", response_model=AnnouncementOut,
            responses={404: {"model": ErrorResponse}})
async def update_announcement(announcement_id: int, body: AnnouncementIn) -> AnnouncementOut:
    """Re-translate and replace."""
    raise NotImplementedYet("dev-b")


@router.delete("/announcements/{announcement_id}", response_model=Ok,
               responses={404: {"model": ErrorResponse}})
async def delete_announcement(announcement_id: int) -> Ok:
    raise NotImplementedYet("dev-b")
