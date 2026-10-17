"""Write the API contract to docs/openapi.json for the frontend team.

    cd backend
    python scripts/export_openapi.py

The spec is generated from the code (app/schemas.py + the routers), so it never drifts.
Re-run it whenever a schema changes and commit the result. Needs no API key.
"""

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402  (after sys.path so it works from any folder)

OUT = BACKEND.parent / "docs" / "openapi.json"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(app.openapi()['paths'])} paths)")


if __name__ == "__main__":
    main()
