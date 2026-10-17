"""Used by the onboarding screen: the parent types a Kita code, the UI shows
"Kita Sonnenblume, Berlin" (or the "Kita code not found" state on 404)."""

from fastapi import APIRouter

from app.config import get_settings
from app.errors import NotFound
from app.schemas import ErrorResponse, KitaInfo

router = APIRouter(tags=["kitas"])


@router.get("/kitas/{code}", response_model=KitaInfo, responses={404: {"model": ErrorResponse}})
async def get_kita(code: str) -> KitaInfo:
    """Look up a Kita by code (case-insensitive). Only one Kita exists: settings.kita_code."""
    settings = get_settings()
    if code.strip().upper() != settings.kita_code.upper():
        raise NotFound("Kita code not found.")
    return KitaInfo(code=settings.kita_code, name=settings.kita_name, city=settings.kita_city)
