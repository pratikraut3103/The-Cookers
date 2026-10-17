"""Ask the running API the domain expert's questions and print the answers for a human to read.

    cd backend
    uvicorn app.main:app --port 8000          # in another terminal, with MOCK_AI=false
    python scripts/eval_questions.py          # or: --base-url http://host:8000 --lang ar

Not an automatic grader. PASS/CHECK only says whether the expected source was cited (or, for
questions the documents do not cover, whether the API refused to guess). Read every answer.
Replace the placeholder questions in tests/eval_questions.json once the real document pack exists.
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

QUESTIONS = Path(__file__).resolve().parent.parent / "tests" / "eval_questions.json"


def verdict(expected_source: str | None, body: dict) -> str:
    """PASS when the answer matches the expectation, CHECK when a human should look closer."""
    if expected_source is None:
        ok = body["answered_from_documents"] is False and not body["sources"]
    else:
        ok = body["answered_from_documents"] and any(s["document"] == expected_source for s in body["sources"])
    return "PASS " if ok else "CHECK"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--lang", help="override the language of every question")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")  # Arabic output on Windows consoles
    questions = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    checks = 0

    with httpx.Client(base_url=args.base_url, timeout=90) as client:
        for n, q in enumerate(questions, 1):
            lang = args.lang or q["lang"]
            try:
                r = client.post("/api/v1/ask", json={"question": q["question"], "lang": lang})
                r.raise_for_status()
            except httpx.HTTPError as e:
                print(f"\n[{n}] ERROR {e}\n    {q['question']}")
                checks += 1
                continue
            body = r.json()
            mark = verdict(q["expected_source"], body)
            checks += mark.strip() == "CHECK"
            sources = ", ".join(f"{s['document']} {s['section'] or ''}".strip() for s in body["sources"]) or "-"
            print(f"\n[{n}] {mark} ({lang}) {q['question']}")
            print(f"    answer:   {body['answer']}")
            print(f"    to do:    {body['what_to_do']}")
            print(f"    note:     {body['cultural_note']}")
            print(f"    sources:  {sources}  | from documents: {body['answered_from_documents']}"
                  f" | suggest draft: {body['suggest_draft']}")

    print(f"\n{len(questions) - checks} PASS, {checks} CHECK. Read the answers above before trusting the marks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
