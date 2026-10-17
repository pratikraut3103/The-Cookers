# Team Plan: Kita Companion backend (2 hours, 3 developers)

Read this first, then your own plan file in `docs/plans/`. Design background: `docs/design/kita-companion-design.md`. Full architecture: `docs/ARCHITECTURE.md`. The API contract lives in `backend/app/schemas.py` and, when the server runs, at <http://localhost:8000/docs>.

## 0. Repository layout

```
The-Cookers/
├── backend/                  Python + FastAPI (this plan). Run every backend command from here.
│   ├── app/                  routers/ (HTTP), services/ (logic, Claude, SQLite), schemas.py, db.py, auth.py ...
│   ├── prompts/              Claude instructions (*.md)
│   ├── data/
│   │   ├── kita-sonnenblume/ the fake Kita's documents (knowledge base)
│   │   └── seed/             starter announcements (Dev B)
│   ├── tests/                conftest.py + one acceptance test file per developer
│   ├── scripts/              eval + OpenAPI export (Dev A, Dev C)
│   ├── requirements.txt  .env.example  pytest.ini
├── frontend/                 React + Vite, owned by the frontend team (not touched by this plan)
├── docs/
│   ├── TEAM_PLAN.md          this file
│   ├── ARCHITECTURE.md       system design and endpoint map
│   ├── BACKEND_PLAN.md       first draft, superseded by ARCHITECTURE.md
│   ├── design/               product design doc
│   └── plans/                one plan per branch: dev-a-parent-ai.md, dev-b-staff-publish.md, dev-c-staff-docs-insights.md
└── README.md                 the hackathon README (Dev C rewrites it)
```

All file paths in this plan are **relative to `backend/`** unless they start with `docs/` or `frontend/`.

## 1. How the system works

```
Frontend (other team, Vite :8443) ── JSON/REST ──▶ FastAPI /api/v1 ──▶ Claude (claude-sonnet-5-5)
                                                       │
                       ┌───────────────────────────────┼───────────────────────────────┐
                       ▼                               ▼                               ▼
          data/kita-sonnenblume/*.md          SQLite data/kita.db              prompts/*.md
          (knowledge base, in the prompt)     announcements, translations,     (instructions)
                                              anonymous query log, feedback
```

Three flows make the product:
1. **Parent asks** → `POST /ask` → Claude answers *only* from the Kita documents (cached in the system prompt), cites the source, says "ask the teacher" when unsure → the question is logged anonymously.
2. **Staff publishes** → staff writes one German announcement → `POST /staff/announcements` → one Claude call translates it into English and German (simple German) with a cultural note → saved → parents see it in `GET /week?lang=`.
3. **Staff edits a document** → `PUT /staff/documents/{name}` → file rewritten, prompt cache cleared → the next `/ask` uses the new text.

`MOCK_AI=true` makes every endpoint answer without calling Claude (no key, no credits). Everything below can be built and tested in mock mode.

## 2. Who owns what

Each developer owns separate files, so merges do not conflict. Detailed task lists: `docs/plans/dev-a-parent-ai.md`, `dev-b-staff-publish.md`, `dev-c-staff-docs-insights.md`. **Shared files (do not edit in a feature branch):** `app/schemas.py`, `app/main.py`, `app/db.py`, `app/errors.py`, `app/auth.py`, `app/deps.py`, `app/services/claude.py`, `tests/conftest.py`. If you truly need a change there, tell the others and open a tiny PR to `develop` first.

| | Branch | Theme | Owns (edit freely) |
|---|---|---|---|
| **Dev A** | `feat/parent-ai` | Parent flow and AI quality | `routers/ask.py draft.py kitas.py feedback.py`, `services/mock.py`, `prompts/ask.md draft_message.md`, `data/kita-sonnenblume/**`, `scripts/`, `tests/test_parent.py` |
| **Dev B** | `feat/staff-publish` | Announcements and the week board | `routers/staff_announcements.py week.py`, `services/announcements.py translate.py`, `prompts/translate_announcement.md`, `data/seed/`, `tests/test_staff_publish.py` |
| **Dev C** | `feat/staff-docs-insights` | Knowledge base, insights, README, handoff | `routers/staff_documents.py staff_insights.py`, `services/documents.py insights.py`, `README.md`, `scripts/export_openapi.py`, `tests/test_staff_docs_insights.py` |

**Your definition of done = your test file is green.** Stubs return `501 Not built yet`, so your tests start red. Run only yours (from `backend/`): `pytest tests/test_parent.py` (A), `tests/test_staff_publish.py` (B), `tests/test_staff_docs_insights.py` (C). Then run the whole suite before opening your PR.

## 3. Setup (everyone, first 10 minutes)

```powershell
git clone https://github.com/pratikraut3103/The-Cookers.git
cd The-Cookers
git checkout feat/<your-branch>      # feat/parent-ai | feat/staff-publish | feat/staff-docs-insights
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env               # set MOCK_AI=true, or paste your Console API key
.\.venv\Scripts\python.exe -m pytest -q          # 20 pass, 23 fail (the stubs): that is expected
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
**Secrets:** the API key lives only in `backend/.env`, which git ignores. Never paste a key into code, docs, tests, commit messages or chat. Before every push run `git status` and make sure no `.env` file is listed. The demo values `SONNE` (Kita code) and `demo-staff-token` are intentionally public and are not secrets. Staff login for manual tests: `POST /api/v1/staff/login {"code": "SONNE"}` returns the bearer token; use it as `Authorization: Bearer <token>` (Swagger's lock icon works too).

## 4. Dev A: parent flow and AI quality (`feat/parent-ai`)

| # | Task | Time |
|---|---|---|
| A1 | `GET /kitas/{code}` in `routers/kitas.py`: values from `settings.kita_*`, case-insensitive, `NotFound("Kita code not found.")` otherwise | 10 min |
| A2 | `POST /feedback` in `routers/feedback.py` using `logs.add_feedback` (already written) | 10 min |
| A3 | Pass `child_name` / `parent_name` into the draft prompt; update `prompts/draft_message.md` (sign with the parent's name, name the child) | 15 min |
| A4 | **Real-key quality pass** (`MOCK_AI=false`): ask the fever, Eingewöhnung, Laternenfest and "own lunch" questions in `en` and `de`; tune `prompts/ask.md`. Check in the server log that the second identical call shows `cache_read` above 0 | 30 min |
| A5 | `scripts/eval_questions.py` + `tests/eval_questions.json`: the domain expert's 10 questions, runs against the real API, prints answer, source and `answered_from_documents` for a human to check. Include 3 questions the documents do not cover | 25 min |
| A6 | With the domain expert, replace the placeholder pack in `data/kita-sonnenblume/` with the real one. **Keep the demo facts:** today is Mon 9 Nov 2026, permission slip due Wed 11 Nov, Laternenfest Thu 12 Nov 17:00, Kita closed Fri 13 Nov, 24 h fever rule in house rules §4 | ongoing |

Mock mode must keep working: `services/mock.py` answers "fever" questions with the §4 rule.

## 5. Dev B: announcements and the week board (`feat/staff-publish`)

| # | Task | Time |
|---|---|---|
| B1 | Repository in `services/announcements.py`: create, list (newest first), get, update, delete, with translations (tables exist in `app/db.py`; `bring` is stored as JSON text) | 25 min |
| B2 | `prompts/translate_announcement.md` and `services/translate.py`: `translate(AnnouncementIn) -> TranslationsAI` through `claude.generate("translate_announcement", messages, TranslationsAI)`. Output: title, message, bring and a short cultural note per language, simple words. In `MOCK_AI` mode return deterministic fake text, e.g. `"[ar] Sommerfest"` | 25 min |
| B3 | Routes in `routers/staff_announcements.py` (publish, preview, update, delete, list). **Translate first, save second**: if Claude fails, nothing is saved (a test checks this) | 20 min |
| B4 | `seed_if_empty()` + `data/seed/announcements.json` (German): permission slip deadline Wed 2026-11-11, Laternenfest Thu 2026-11-12 17:00 (bring: Laterne), closure Fri 2026-11-13, and a **daily** reminder for Matschhose und Gummistiefel. Store ready-made translations in the seed so it needs no Claude call | 20 min |
| B5 | `routers/week.py`: build the board from the store: items whose date is within 7 days of `today` plus recurring ones; text from the requested language's translation; `is_new` = published in the last 48 h; sort by date, recurring last. Keep `WeekResponse` unchanged. The Claude-based path can be deleted | 25 min |

Do not call Claude from `GET /week`; it must be instant and identical every time.

## 6. Dev C: knowledge base, insights, README, handoff (`feat/staff-docs-insights`)

| # | Task | Time |
|---|---|---|
| C1 | Documents API in `routers/staff_documents.py` and helpers in `services/documents.py`: list (name, title from the first `# ` heading, updated_at, size), get, put. **Path safety:** `.md` only, resolve the path and check it stays inside `settings.data_dir`. After a write call `prompts.invalidate()` | 30 min |
| C2 | `GET /staff/insights` in `routers/staff_insights.py` and `services/insights.py`: plain SQL over `query_log`, rules are in the file's docstring | 30 min |
| C3 | `README.md` (hackathon rule: who it is for, the problem, what the demo does, how to run, credits). Use the three one-liners from the design doc. Replace the event README text | 20 min |
| C4 | `scripts/export_openapi.py` writes `openapi.json`. Give the frontend team the base URL, `/docs`, and this Vite snippet to avoid CORS: `server: { proxy: { '/api': 'http://localhost:8000' } }` in `vite.config.ts` | 15 min |
| C5 | At the end: fresh-clone test. Clone into a new folder, follow the README exactly, fix what breaks | 15 min |

## 7. Timeline

| Time | What |
|---|---|
| 0:00-0:10 | Everyone: setup (§3), read your section |
| 0:10-0:45 | Build. **0:45 checkpoint:** each person posts one line: done / blocked |
| 0:45-1:15 | Build. Commit small, push often |
| 1:15-1:30 | Rebase on `develop`, open PR **into `develop`**, review a teammate's PR (A reviews B, B reviews C, C reviews A), merge |
| 1:30-1:50 | Integration on `develop`: real API key, frontend connected, click through both sides |
| 1:50-2:00 | Freeze. Full test run, README check, record the demo |

## 8. Git rules

- Branch from `develop`, PR back into `develop`. Nobody pushes to `main` until the final merge.
- Only touch your own files (§2). If a merge conflict appears in a shared file, stop and ask.
- Before the PR: `git fetch && git rebase origin/develop`, then `pytest -q` (everything green except stubs owned by others that are not merged yet).
- Commit messages: short, imperative ("Add Kita lookup endpoint").

## 9. If you fall behind (cut order)

1. Dev C: insights (UI can stay mocked), then document editing.
2. Dev B: `PUT` update (publish, list and week are what the demo shows).
3. Dev A: eval script (do manual checks instead). **Never cut:** `/ask`, `/draft-message`, `/week`, publish.
