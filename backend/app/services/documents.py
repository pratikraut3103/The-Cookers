"""The Kita's document pack: loading it for the prompt, and the staff editor's file operations.

Security: document names come from the network. `safe_path` is the only way to turn a name
into a file path, and it only allows a short whitelist of characters (no "..", no hidden files,
no drive letters or Windows ":stream" names), at most one folder level, and `.md` files that
resolve inside `data_dir`.
"""

import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.errors import InvalidRequest, NotFound
from app.schemas import DocumentContent, DocumentInfo

_SEGMENT = re.compile(r"^\w[\w\- .]*$")  # starts with a letter/digit/underscore: no "..", no ".hidden"
MAX_DEPTH = 2  # one folder + the file, e.g. letters/laternenfest.md


def load_documents(data_dir: Path) -> dict[str, str]:
    """Return {relative/path.md: content}, sorted so the prompt (and its cache) is stable."""
    docs = {}
    for path in sorted(data_dir.rglob("*.md")):
        docs[path.relative_to(data_dir).as_posix()] = path.read_text(encoding="utf-8").strip()
    return docs


def render_documents(docs: dict[str, str]) -> str:
    return "\n\n".join(
        f'<document name="{name}">\n{content}\n</document>' for name, content in docs.items()
    )


@lru_cache
def documents_block() -> str:
    docs = load_documents(get_settings().data_dir)
    if not docs:
        raise RuntimeError(f"No Kita documents found in {get_settings().data_dir}")
    return render_documents(docs)


# ---------- staff editor ----------

def safe_path(name: str) -> Path:
    """Validate a document name and return its absolute path inside data_dir."""
    parts = name.split("/")
    if (
        not name.endswith(".md")
        or len(parts) > MAX_DEPTH
        or not all(_SEGMENT.match(p) for p in parts)
    ):
        raise InvalidRequest("Invalid document name.")
    root = get_settings().data_dir.resolve()
    target = (root / name).resolve()
    if not target.is_relative_to(root):  # defence in depth: symlinks, odd filesystems
        raise InvalidRequest("Invalid document name.")
    return target


def _title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip() or fallback
    return fallback


def list_docs() -> list[DocumentInfo]:
    root = get_settings().data_dir.resolve()
    infos = []
    for path in sorted(root.rglob("*.md")):
        stat = path.stat()
        name = path.relative_to(root).as_posix()
        infos.append(DocumentInfo(
            name=name,
            title=_title(path.read_text(encoding="utf-8"), path.stem),
            updated_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds"),
            size=stat.st_size,
        ))
    return infos


def read_doc(name: str) -> DocumentContent:
    path = safe_path(name)
    if not path.is_file():
        raise NotFound("Document not found.")
    return DocumentContent(name=name, content=path.read_text(encoding="utf-8"))


def write_doc(name: str, content: str) -> DocumentContent:
    """Create or replace a document. Writes to a temp file first so a crash never leaves half a file.

    The caller must call prompts.invalidate() afterwards (not done here: prompts imports this module).
    """
    path = safe_path(name)
    text = content.replace("\r\n", "\n").strip() + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    os.replace(tmp, path)
    return DocumentContent(name=name, content=text)
