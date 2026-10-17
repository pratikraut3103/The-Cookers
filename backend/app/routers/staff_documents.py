"""The Kita's knowledge base: the .md files that /ask answers from.

Every write calls prompts.invalidate(), so the very next /ask uses the new text. Path safety
lives in services/documents.safe_path.
"""

from fastapi import APIRouter, Depends

from app.auth import require_staff
from app.schemas import DocumentContent, DocumentInfo, DocumentWrite, ErrorResponse
from app.services import documents, prompts

router = APIRouter(
    prefix="/staff", tags=["staff: documents"],
    dependencies=[Depends(require_staff)],
    responses={401: {"model": ErrorResponse}},
)


@router.get("/documents", response_model=list[DocumentInfo])
async def list_documents() -> list[DocumentInfo]:
    return documents.list_docs()


@router.get("/documents/{name:path}", response_model=DocumentContent,
            responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
async def get_document(name: str) -> DocumentContent:
    return documents.read_doc(name)


@router.put("/documents/{name:path}", response_model=DocumentContent,
            responses={422: {"model": ErrorResponse}})
async def put_document(name: str, body: DocumentWrite) -> DocumentContent:
    """Create or replace a document (also used for 'Dokument hinzufügen')."""
    saved = documents.write_doc(name, body.content)
    prompts.invalidate()
    return saved
