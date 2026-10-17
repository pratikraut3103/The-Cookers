"""Staff dashboard: write once in German, parents see it in their language.

Publishing translates FIRST and saves SECOND. If Claude fails, nothing is stored, so the
dashboard never shows a half-published item (the shared handler turns AIError into a 502).
"""

from fastapi import APIRouter, Depends

from app.auth import require_staff
from app.errors import NotFound
from app.schemas import AnnouncementIn, AnnouncementOut, ErrorResponse, Ok, PreviewResponse
from app.services import announcements, translate

router = APIRouter(
    prefix="/staff", tags=["staff: announcements"],
    dependencies=[Depends(require_staff)],
    responses={401: {"model": ErrorResponse}},
)


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements() -> list[AnnouncementOut]:
    """Newest first."""
    return announcements.list_all()


@router.post("/announcements", response_model=AnnouncementOut, status_code=201,
             responses={502: {"model": ErrorResponse}})
async def create_announcement(body: AnnouncementIn) -> AnnouncementOut:
    """Translate into all languages, then publish."""
    translations = await translate.translate(body)
    return announcements.create(body, translations)


@router.post("/announcements/preview", response_model=PreviewResponse,
             responses={502: {"model": ErrorResponse}})
async def preview_announcement(body: AnnouncementIn) -> PreviewResponse:
    """Translate only (the 'Vorschau für Eltern' modal). Nothing is saved."""
    return PreviewResponse(translations=await translate.translate(body))


@router.put("/announcements/{announcement_id}", response_model=AnnouncementOut,
            responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
async def update_announcement(announcement_id: int, body: AnnouncementIn) -> AnnouncementOut:
    """Replace an announcement. Re-translates only when the German text changed."""
    existing = announcements.get(announcement_id)
    if existing is None:  # check before spending a Claude call
        raise NotFound("Announcement not found.")
    translations = None if announcements.same_source(existing, body) else await translate.translate(body)
    updated = announcements.update(announcement_id, body, translations)
    if updated is None:  # deleted between the check and the write
        raise NotFound("Announcement not found.")
    return updated


@router.delete("/announcements/{announcement_id}", response_model=Ok,
               responses={404: {"model": ErrorResponse}})
async def delete_announcement(announcement_id: int) -> Ok:
    if not announcements.delete(announcement_id):
        raise NotFound("Announcement not found.")
    return Ok()
