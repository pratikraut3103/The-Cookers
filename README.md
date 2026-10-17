# Kita Companion

> Built at Claude Impact Lab Berlin, 17 Oct 2026. All data in this demo is fake.

**Who it's for:** immigrant parents in Germany whose child attends a Kita and who struggle with German and with how Kitas work. Kita teams are the second audience: they share information once and every parent understands it.

**Their problem today:** a Kita's rules, letters and events reach parents in German and assume local habits (Eingewöhnung, Laternenfest, the sick-child rules). Parents miss things, feel judged and are afraid to ask. General AI chatbots guess, because they know nothing about *this* Kita.

**What the demo lets them do**
- **Parents** see their Kita's week in their own language, ask any question and get an answer based on the Kita's own documents (with the source, and "ask the teacher" when the documents don't say), and send the Kita a polite German message drafted by Claude.
- **Kita staff** write one announcement in German; Claude translates it into English and rewrites it in plain, simple German, each with a short cultural note; parents see it straight away. Staff also keep the documents up to date and see which questions the documents can't answer.

Languages for now: English and German. More languages are a small change (one line in `LANGUAGES`, one field in `TranslationsAI`, seed translations).

## How Claude is used

- **Ask:** the Kita's documents sit in the system prompt (prompt-cached); Claude answers only from them, cites the source and refuses to guess or give medical advice.
- **Draft message:** the parent writes in their language, Claude returns polite German plus a back-translation so they know what they send.
- **Publish:** one Claude call turns a German announcement into English and plain German; the result is stored, so reading the week board needs no AI call.

Model: `claude-sonnet-5-5` through the Anthropic API.

## Run it

You need Python 3.11+ and (for the UI) Node with pnpm.

```powershell
# backend (from the repository root)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env      # paste your ANTHROPIC_API_KEY, or set MOCK_AI=true to run without one
.\.venv\Scripts\python.exe scripts\check_claude.py     # optional: checks the key with one tiny call
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
API docs: <http://localhost:8000/docs>. If `check_claude.py` says the key is "not scoped to a workspace": create the key inside a workspace in the Claude Console, or put that workspace's id in `ANTHROPIC_WORKSPACE_ID` in `backend/.env`. On macOS/Linux use `source .venv/bin/activate`, `cp` and `python`.

```powershell
# frontend (second terminal)
cd frontend
pnpm install
pnpm dev                    # http://localhost:8443
```
The dev server already proxies `/api` to the backend on port 8000, so the UI works without CORS settings. Use `.\scripts\dev.ps1` (add `-Mock` to run without an API key) to start both in one go, then open <http://localhost:8443>. API contract and screen-to-endpoint map: [docs/FRONTEND_HANDOFF.md](docs/FRONTEND_HANDOFF.md).

**Staff login:** Kita code `SONNE` (demo access, not real security).

**Tests:** `cd backend && python -m pytest` (no API key needed; they run in mock mode).
**UI test:** `.\scripts\e2e.ps1` drives the real UI in Chrome against the real backend (mock AI, throw-away data, about 40 s). `.\scripts\e2e.ps1 -Live` does a smaller run with real Claude answers (a few cents).
**Check answer quality with a real key:** start the server with `MOCK_AI=false`, then `python scripts/eval_questions.py`.

## Project layout

```
backend/    FastAPI app (app/), prompts, fake Kita documents (data/), tests, scripts
frontend/   React + Vite UI (parent and staff screens)
docs/       architecture, team plan, frontend handoff, OpenAPI contract
```
Design and architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/design/kita-companion-design.md](docs/design/kita-companion-design.md).

## Privacy and limits

- No parent accounts. Questions are stored without names or contact data, tied only to a random id from the browser. A question typed as free text could still contain a name, so a real product would need scrubbing and a retention limit.
- The child's birthday and name stay in the browser.
- Staff login is a demo shortcut. Do not use real personal data.
- Some numbers in the UI (families connected, "seen by", weather, the calendar) are mocked.

## Credits

[Anthropic Claude API](https://docs.claude.com) and the `anthropic` Python SDK · [FastAPI](https://fastapi.tiangolo.com) · [Uvicorn](https://www.uvicorn.org) · [Pydantic](https://docs.pydantic.dev) · SQLite · [React](https://react.dev) · [Vite](https://vite.dev) · Tailwind CSS · UI designed with Figma Make.
