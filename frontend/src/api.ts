// Typed client for the Kita Companion backend. Types mirror backend/app/schemas.py
// (see docs/FRONTEND_HANDOFF.md). Calls go to /api/v1, which the Vite dev server proxies to the backend.

export type Lang = "en" | "de";
export type LanguageInfo = { code: Lang; label: string; rtl: boolean };
export type Source = { document: string; section: string | null };

export type AskResponse = {
  id: number;
  answer: string;
  what_to_do: string | null;
  cultural_note: string | null;
  sources: Source[];
  answered_from_documents: boolean;
  suggest_draft: boolean;
};
export type ChatTurnIn = { role: "user" | "assistant"; content: string };
export type DraftResponse = { german_message: string; back_translation: string; lang: Lang };

export type ItemType = "event" | "closure" | "deadline" | "reminder";
export type WeekItem = {
  id: number | null;
  type: ItemType;
  title: string;
  date: string | null;
  time: string | null;
  message: string | null;
  bring: string[];
  cultural_note: string | null;
  is_new: boolean;
  recurring: "daily" | null;
  source: Source | null;
};
export type WeekResponse = { lang: Lang; generated_for: string; items: WeekItem[] };

export type Translation = { title: string; message: string; bring: string[]; cultural_note: string | null };
export type AnnouncementIn = {
  type: ItemType;
  title: string;
  message: string;
  starts_on: string | null;
  time: string | null;
  deadline_on: string | null;
  bring: string[];
  recurring: "daily" | null;
};
export type Announcement = AnnouncementIn & {
  id: number;
  published_at: string;
  translations: Record<string, Translation>;
};

export type DocumentInfo = { name: string; title: string; updated_at: string; size: number };
export type DocumentContent = { name: string; content: string };
export type Insights = {
  families: number;
  questions_this_week: number;
  languages: { lang: string; count: number }[];
  top_questions: { text: string; count: number }[];
  unanswered: { text: string; count: number }[];
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const BASE = "/api/v1";
const FAMILY_KEY = "kita.familyId";
const TOKEN_KEY = "kita.staffToken";

// localStorage can throw (private windows, blocked storage): the app must still work without it.
function read(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function write(store: "local" | "session", key: string, value: string | null) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let memoryFamilyId: string | null = null;
/** Anonymous random id, only used so staff can count families. Not a name, not a device fingerprint. */
export function familyId(): string {
  const existing = read("local", FAMILY_KEY) ?? memoryFamilyId;
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? `f-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  memoryFamilyId = id;
  write("local", FAMILY_KEY, id);
  return id;
}
export function forgetFamilyId() {
  memoryFamilyId = null;
  write("local", FAMILY_KEY, null);
}

let memoryToken: string | null = null;
export const staffToken = {
  get: () => read("session", TOKEN_KEY) ?? memoryToken,
  set: (token: string) => {
    memoryToken = token;
    write("session", TOKEN_KEY, token);
  },
  clear: () => {
    memoryToken = null;
    write("session", TOKEN_KEY, null);
  },
};

export const UNAUTHORIZED_EVENT = "kita:unauthorized";

type Options = { body?: unknown; staff?: boolean; family?: boolean };

async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.family) headers["x-family-id"] = familyId();
  if (opts.staff) {
    const token = staffToken.get();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the server.");
  }

  if (!res.ok) {
    let code = "internal_error";
    let message = "Something went wrong, please try again in a moment.";
    try {
      const data = await res.json();
      if (data?.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
      }
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && opts.staff) {
      staffToken.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `?${q}` : "";
};

// ----- parent -----
export const languages = () => request<{ languages: LanguageInfo[] }>("GET", "/languages");
export const week = (lang: Lang, today?: string) =>
  request<WeekResponse>("GET", `/week${qs({ lang, today })}`);
export const ask = (question: string, lang: Lang, history: ChatTurnIn[] = []) =>
  request<AskResponse>("POST", "/ask", { body: { question, lang, history }, family: true });
export const feedback = (queryId: number, helpful: boolean) =>
  request<{ ok: true }>("POST", "/feedback", { body: { query_id: queryId, helpful } });
export const draftMessage = (text: string, lang: Lang, childName?: string, parentName?: string) =>
  request<DraftResponse>("POST", "/draft-message", {
    body: { text, lang, child_name: childName || null, parent_name: parentName || null },
  });

// ----- staff -----
export const staffLogin = (code: string) => request<{ token: string }>("POST", "/staff/login", { body: { code } });
export const listAnnouncements = () => request<Announcement[]>("GET", "/staff/announcements", { staff: true });
export const createAnnouncement = (body: AnnouncementIn) =>
  request<Announcement>("POST", "/staff/announcements", { body, staff: true });
export const updateAnnouncement = (id: number, body: AnnouncementIn) =>
  request<Announcement>("PUT", `/staff/announcements/${id}`, { body, staff: true });
export const deleteAnnouncement = (id: number) =>
  request<{ ok: true }>("DELETE", `/staff/announcements/${id}`, { staff: true });
export const previewAnnouncement = (body: AnnouncementIn) =>
  request<{ translations: Record<string, Translation> }>("POST", "/staff/announcements/preview", { body, staff: true });
export const listDocuments = () => request<DocumentInfo[]>("GET", "/staff/documents", { staff: true });
export const getDocument = (name: string) =>
  request<DocumentContent>("GET", `/staff/documents/${name}`, { staff: true });
export const putDocument = (name: string, content: string) =>
  request<DocumentContent>("PUT", `/staff/documents/${name}`, { body: { content }, staff: true });
export const insights = () => request<Insights>("GET", "/staff/insights", { staff: true });
