# Frontend handoff: how to call the backend

Written for the frontend team. Matches the `kita2` design (branch `design`). Machine-readable contract: [`openapi.json`](openapi.json); live docs with a "Try it out" button: <http://localhost:8000/docs>.

## Run the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env          # set MOCK_AI=true to work without an API key
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
`MOCK_AI=true` returns fixed example answers (the fever question gets the 24 h rule). Everything else (announcements, seed data, staff screens) works the same with or without a key.

## Avoid CORS: proxy `/api`

In `frontend/vite.config.ts`, inside `defineConfig` → `server`:
```ts
proxy: { '/api': 'http://localhost:8000' }
```
Then call relative URLs like `fetch('/api/v1/week?lang=en')`. (Without the proxy, `http://localhost:8443` is already allowed by CORS; other origins must be added to `CORS_ORIGINS` in the backend `.env`.)

## Conventions

- Base path `/api/v1`, JSON everywhere. Language codes: `en ar uk tr es` (`GET /languages` also says which are right-to-left).
- **Anonymous family id:** generate a random id once (`crypto.randomUUID()`), keep it in `localStorage`, and send it as header `X-Family-Id` on `/ask`. It only lets staff count families.
- **Staff routes** (`/staff/*` except login) need `Authorization: Bearer <token>`. Get the token from `POST /staff/login` with the Kita code (`SONNE`). Demo login, not real security.
- **Errors** always look like this, and `message` is safe to show to the user as is:
  ```json
  {"error": {"code": "ai_unavailable", "message": "Something went wrong, please try again in a moment."}}
  ```
  `code`: `invalid_request` (422) · `unauthorized` (401) · `not_found` (404) · `ai_unavailable` / `ai_bad_output` (502) · `internal_error` (500).
- Claude calls (`/ask`, `/draft-message`, publish, preview) take a few seconds: show the "Reading your Kita's documents…" state and disable the button while waiting.

## Screen to endpoint

| Screen | Call |
|---|---|
| Onboarding: language list | `GET /languages` |
| Onboarding: child name, **birthday** | **Browser only** (`localStorage`). Never send the birthday to the backend. |
| Home: This week | `GET /week?lang=en` |
| Ask / chat | `POST /ask` `{question, lang, history?}` + header `X-Family-Id` |
| "Not in the documents" card | shown when the answer has `answered_from_documents: false` |
| 👍 / 👎 | `POST /feedback` `{query_id: <answer.id>, helpful}` |
| Write to the Kita → Create message | `POST /draft-message` `{text, lang, child_name?, parent_name?}` |
| Settings → Delete my data | Clear `localStorage`. The server holds nothing that identifies a parent. |
| Calendar | **No endpoint.** Keep it static, or build it from `/week` (7 days only). |
| Staff login | `POST /staff/login` `{code}` → `{token}` |
| Dashboard: list / publish / edit / delete | `GET` / `POST` / `PUT /{id}` / `DELETE /{id}` on `/staff/announcements` |
| Dashboard: Vorschau für Eltern | `POST /staff/announcements/preview` (same body as publish, nothing saved) |
| Documents list / editor | `GET /staff/documents`, `GET` and `PUT /staff/documents/{name}` (e.g. `letters/laternenfest.md`) |
| Eltern-Übersicht | `GET /staff/insights` |

## Request and response examples

```jsonc
// POST /api/v1/ask
{"question": "My son has a fever, can he go tomorrow?", "lang": "en"}
// 200
{"id": 7, "answer": "No. ... 24 hours ...", "what_to_do": "Keep him home ...", "cultural_note": "...",
 "sources": [{"document": "house-rules.md", "section": "§4 Krankheit"}],
 "answered_from_documents": true, "suggest_draft": false}
```
When `answered_from_documents` is `false`, `sources` is empty and `suggest_draft` is `true`: show the "not in the documents" card and open the composer with the parent's question as the text.

```jsonc
// POST /api/v1/draft-message
{"text": "Yusuf will be late tomorrow, doctor appointment", "lang": "en", "child_name": "Yusuf", "parent_name": "Amira"}
// 200
{"german_message": "Guten Tag, ...", "back_translation": "Hello, ...", "lang": "en"}
```
`parent_name` is optional. **Without it the German message has no signature.** The onboarding has no field for the parent's name yet ("Amira" is hardcoded in the design), so either add one or accept an unsigned message.

```jsonc
// GET /api/v1/week?lang=ar   (optional ?today=2026-11-02 to pin the date)
{"lang": "ar", "generated_for": "2026-11-02", "items": [
  {"id": 2, "type": "event", "title": "مسيرة الفوانيس (Laternenfest)", "date": "2026-11-05", "time": "17:00",
   "message": "...", "bring": ["فانوس منزلي الصنع"], "cultural_note": "...", "is_new": false, "recurring": null, "source": null}]}
```
- Items are sorted by date; **recurring items have `date: null`** and come last ("Every day").
- `type` → icon in the design: `deadline` ⚠️ · `event` 🏮 · `closure` 📅 · `reminder` 🧥. `is_new` → the "New" tag.
- `bring` is a list: show it as `Bring: a, b`.

```jsonc
// POST /api/v1/staff/announcements   (the form must send real values, see below)
{"type": "event", "title": "Laternenfest", "message": "Am Donnerstag ...", "starts_on": "2026-11-05",
 "time": "17:00", "deadline_on": null, "bring": ["Laterne"], "recurring": null}
// 201: the same fields plus "id", "published_at" and "translations": {"en": {...}, "ar": {...}, "uk": ..., "tr": ..., "es": ...}
```

## Things the staff form needs to change

- "Datum und Uhrzeit" is one free-text field (`Do, 5. Nov, 17:00`). The API needs `starts_on` as `YYYY-MM-DD` and `time` as `HH:MM`: use a date input and a time input.
- Art des Aushangs → `type`: Veranstaltung `event` · Kita geschlossen `closure` · Frist `deadline` · Erinnerung `reminder`. "Mit Frist" + date → `deadline_on`.
- "Bitte mitbringen" is one input: split it on commas into the `bring` list.
- A daily reminder (Matschhose) sends `recurring: "daily"` and no `starts_on`.
- A non-recurring announcement without `starts_on` gets a 422.

## Not backed by the server (keep mocked, do not present as real)

"14 Familien verbunden", "gesehen von 11 von 14 Familien", the weather, and the Calendar screen. The insights screen is real, but only families that asked a question are counted.
