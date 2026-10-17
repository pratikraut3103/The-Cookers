# Kita Companion: Backend Architecture

Aligned with the screens in `frontend/src/App.tsx`. Supersedes the endpoint list in `BACKEND_PLAN.md` where they differ. Backend paths below (`app/`, `data/`, `prompts/`, `tests/`) are relative to `backend/`. Team split and schedule: `TEAM_PLAN.md`.

## 1. What the frontend actually needs

The frontend is a Figma Make prototype (React 19, Vite, dev server on **port 8443**). Today it makes **no API calls**: every answer, event and number is hardcoded. It has two sides:

| Side | Screens | Backend job |
|---|---|---|
| **Parent** | welcome, onboarding (Kita code + language + child name), home (This week + chat), ask, not-found, composer, result, settings | Ask, draft message, week board, Kita lookup, feedback |
| **Kita staff** | login (Kita code), dashboard (new announcement + list), preview in 4 languages, documents list, document editor, parents overview | Publish announcements, translate them, edit documents, anonymous insights |

The staff side is **out of scope in the design doc** ("no Kita staff features, no accounts"). The frontend team built it anyway, so it is tiered below. Decide the cut line together.

## 2. System diagram

```
 Parent UI ─┐                                   ┌─ Anthropic API (claude-sonnet-5-5)
            │ JSON / REST   ┌───────────────────┤   structured output, cached system prompt
 Staff UI  ─┴──────────────▶│  FastAPI  /api/v1 │
  (Vite :8443)              │                   │
                            │  routers          │   ┌──────────── SQLite (data/kita.db) ───────────┐
                            │   parent: ask, draft, week, kitas, feedback               │
                            │   staff : login, announcements, documents, insights       │
                            │  services         │   │ announcements   (German source)              │
                            │   claude.py ──────┘   │ translations    (announcement x language)    │
                            │   documents.py ───────│ query_log       (anonymous: text, lang, hit) │
                            │   store.py  (SQLite) ─│ feedback        (query_id, helpful)          │
                            │   cache.py            │ families        (anonymous id, lang)         │
                            └───────────────────┘   └──────────────────────────────────────────────┘
                                     │
                                     └─ data/kita-sonnenblume/*.md   (document pack = knowledge base, editable by staff)
```

Principles:
- **Stateless API, tiny store.** SQLite (stdlib `sqlite3`, no server) holds only announcements, translations and anonymous logs. No parent accounts, no names.
- **Documents in the prompt, no RAG.** Unchanged. Staff edits write the `.md` file and reset the cached prompt.
- **Translate on publish, not on read.** Staff writes German once. On publish, one Claude call returns every supported language (English and German for now) plus the cultural note. `GET /week` then reads from the DB: fast, identical on every call, safe for the live demo.
- **Every Claude call goes through `services/claude.py`** (model, timeout, retry, error mapping), as today.

## 3. Endpoint map (screen to API)

Status: ✅ built · 🟡 built, needs a change · ⬜ not built

| Screen | Endpoint | Status |
|---|---|---|
| Onboarding: Kita code check | `GET /kitas/{code}` → `{name, city}` (404 → "Kita code not found" state) | ⬜ |
| Onboarding / settings: language list | `GET /languages` (English and German only) | ✅ |
| Home: This week | `GET /week?lang=` (read from DB, see §4) | 🟡 |
| Home / Ask / Not-found: chat | `POST /ask` (add `id`; `answered_from_documents=false` drives the not-found card) | 🟡 |
| Answer 👍👎 | `POST /feedback` `{query_id, helpful}` | ⬜ |
| Composer / Result | `POST /draft-message` (add optional `child_name`, `parent_name`) | 🟡 |
| Settings: delete my data | none. Parents have no server-side data; the button clears the browser's localStorage | n/a |
| Staff login | `POST /staff/login` `{code}` → `{token}` | ⬜ |
| Dashboard: list | `GET /staff/announcements` | ⬜ |
| Dashboard: publish | `POST /staff/announcements` (triggers translation) | ⬜ |
| Dashboard: edit / delete | `PUT` / `DELETE /staff/announcements/{id}` | ⬜ |
| Preview modal (4 language tabs) | `POST /staff/announcements/preview` → translations, nothing saved | ⬜ |
| Documents list | `GET /staff/documents` | ⬜ |
| Document editor | `GET` / `PUT /staff/documents/{name}` | ⬜ |
| Parents overview | `GET /staff/insights` | ⬜ |
| Health | `GET /health` | ✅ |

## 4. Data model

**Announcement** (German source, written by staff)
`id, type (event|closure|deadline|reminder), title_de, message_de, starts_on (date), time, deadline_on?, bring_de[], recurring? ("daily"), published_at`

**Translation** (one row per announcement and language, generated on publish)
`announcement_id, lang, title, message, bring[], cultural_note`

**WeekItem** returned to the parent UI, matching `EventCard` props: `id, type, title, date, time, bring[], cultural_note, is_new (published in last 48 h), recurring, source`. The icon and tag are chosen by the frontend from `type` and `is_new`.

**Query log** (anonymous): `id, asked_at, lang, question, answered_from_documents`. No IP, no name, no device id.
**Feedback:** `query_id, helpful`. **Family:** random id generated in the browser, plus language, used only to count "families connected" and "seen by".

## 5. Flows

**Parent asks:** `POST /ask` → build messages → Claude (cached documents as system prompt) → validated JSON → log row → response with `id`.

**Staff publishes:** `POST /staff/announcements` → save German row → one Claude call returns `{lang: {title, message, bring, cultural_note}}` for en and de → save translations → return the announcement. On Claude failure: save nothing and return the friendly 502, so the UI never shows a half-published item.

**Staff edits a document:** `PUT /staff/documents/{name}` → validate name (no path separators, `.md` only, size cap) → write file → clear `documents_block()` and prompt caches → the next `/ask` uses the new text and the prompt cache rebuilds once.

**Insights:** plain SQL over the logs: counts, language distribution, top repeated questions, and the questions with `answered_from_documents = 0`. Grouping near-duplicate questions ("Was ist Eingewöhnung?" vs "What is Eingewöhnung?") would need one Claude call. Skip it for the demo and group on exact text.

## 6. Decisions and risks

| Topic | Decision |
|---|---|
| **Auth** | Demo only. Kita code `SONNE` returns a fixed bearer token; `/staff/*` requires it. This is **not real security**, and the UI already says "Demo-Zugang · Keine echten Daten". Never use real data. |
| **CORS** | The Vite dev server is on port **8443** (`strictPort`), which was missing from `.env.example`. Figma's preview may serve from another origin, so the frontend should proxy `/api` to `localhost:8000` in `vite.config.ts` (`server.proxy`) to avoid CORS entirely. |
| **Fake numbers in the UI** | "14 Familien verbunden", "gesehen von 11 von 14", "Light rain · 9°" and "38 Fragen" are hardcoded. Real versions need the `families` table and a seen-tracking call; the weather needs an external API. Recommend keeping them mocked for the demo and not claiming otherwise in the video. |
| **Languages** | **English and German only, for now** (decision: fewer languages, each one checked properly). The frontend design still lists more (incl. right-to-left Arabic): it must build its picker from `GET /languages`. More languages later = one line in `LANGUAGES`, one field in `TranslationsAI`, seed translations. |
| **Prompt injection** | Staff-edited documents and parent text are both treated as data in the prompts (tags plus an explicit rule). Keep it that way for announcement text. |
| **Concurrency** | Single process, SQLite, in-memory caches. Fine for a demo; do not run multiple workers. |
| **Seed data** | `data/seed/announcements.json` (hand-written, German) is loaded on first start, so `/week` is never empty and the demo does not depend on a live publish. |

## 7. Build tiers (cut from the bottom)

| Tier | Scope | Why |
|---|---|---|
| **P0: parent flow** | Wire `/week`, `/ask`, `/draft-message` to the UI; add `child_name`/`parent_name`, query `id`; `GET /kitas/{code}`; CORS/proxy fix | This is the demo (Impact 40 + Working demo 20). Largely built. |
| **P1: publish loop** | SQLite store, seed JSON, `/staff/login`, announcements CRUD with translate-on-publish, preview, `/week` from DB | Strong second half of the demo: staff posts once, the parent sees it in Arabic. |
| **P2: knowledge base editing** | Documents list and editor endpoints | Makes "answers come only from your Kita's documents" visibly live. |
| **P3: insights** | Query log, feedback, `/staff/insights` | Nice for Q&A with judges; the UI can stay mocked. |

## 8. Files to add

```
app/
  routers/   kitas.py  feedback.py  staff.py          (staff.py: login, announcements, documents, insights)
  services/  store.py   (SQLite: schema + queries)   translate.py (announcement → en + de, via claude.py)
  auth.py    (bearer-token dependency for /staff/*)
prompts/     translate_announcement.md
data/seed/   announcements.json
tests/       test_staff.py  test_store.py
```
