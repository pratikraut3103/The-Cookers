import { useEffect, useRef, useState, type ReactNode } from "react";
import * as api from "./api";
import type { Announcement, AnnouncementIn, AskResponse, DocumentInfo, DraftResponse, Insights, ItemType, Lang, Translation, WeekItem } from "./api";
import { AppProvider, useApp } from "./state";
import { useChat, useWeek, type Turn, type WeekState } from "./hooks";
import { errorText, formatDay, formatLong, formatRange, formatShortDate, iconFor, messageTemplates, parseIso, suggestedQuestions, translate, type Key } from "./i18n";

type Screen =
  | "welcome" | "onboarding" | "home" | "ask" | "composer" | "result"
  | "settings" | "kita-login" | "dashboard" | "preview" | "published"
  | "documents" | "editor" | "parents" | "system" | "calendar";

type Go = (s: Screen) => void;

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  className?: string;
  disabled?: boolean;
};

function Button({ children, onClick, variant = "primary", className = "", disabled }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button className="logo" onClick={onClick} aria-label="Kita Companion home">
      <span className="sunflower" aria-hidden="true"><i /></span>
      <span>Kita <b>Companion</b></span>
    </button>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return <button className="icon-btn" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function ParentTop({ go }: { go: Go }) {
  const { lang, setLang, languages, t } = useApp();
  const current = languages.find((l) => l.code === lang);
  const nextLanguage = () => {
    const i = languages.findIndex((l) => l.code === lang);
    setLang(languages[(i + 1) % languages.length].code);
  };
  return (
    <header className="topbar">
      <Logo onClick={() => go("welcome")} />
      <div className="kita-name">Kita Sonnenblume</div>
      <div className="top-actions">
        <Button variant="secondary" className="language" onClick={nextLanguage}>
          <span>◎</span> {current?.label ?? lang} <span>⌄</span>
        </Button>
        <IconButton label={t("settings")} onClick={() => go("settings")}>⚙</IconButton>
      </div>
    </header>
  );
}

function Tag({ children, kind = "new" }: { children: ReactNode; kind?: "new" | "deadline" | "closed" | "success" }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}

type EventCardProps = {
  icon: string; date: string; title: string; note?: string | null; bring?: string; tag?: ReactNode;
  onAsk?: () => void; askLabel?: string; rtl?: boolean;
};

function EventCard({ icon, date, title, note, bring, tag, onAsk, askLabel = "Ask about this", rtl }: EventCardProps) {
  const colon = bring ? bring.indexOf(":") : -1; // "Bring: a lantern" -> label "Bring:" + text
  return (
    <article className="event-card" dir={rtl ? "rtl" : "ltr"}>
      <div className="event-icon" aria-hidden="true">{icon}</div>
      <div className="event-body">
        <div className="event-meta">{date}{tag}</div>
        <h3>{title}</h3>
        {bring && <p className="bring"><b>✓ {colon > 0 ? bring.slice(0, colon + 1) : ""}</b> {colon > 0 ? bring.slice(colon + 1).trim() : bring}</p>}
        {note && <div className="culture"><span>💡</span><p>{note}</p></div>}
        {onAsk && <Button variant="secondary" onClick={onAsk}>{askLabel} <span aria-hidden="true">→</span></Button>}
      </div>
    </article>
  );
}

const SAMPLE_ANSWER: AskResponse = {
  id: 0,
  answer: "No. In this Kita, your child must be fever-free for 24 hours before coming back.",
  what_to_do: "Keep Yusuf at home tomorrow and tell the Kita in the morning.",
  cultural_note: "This rule is common in Germany to protect the other children and staff.",
  sources: [{ document: "house-rules.md", section: "§4 Illness" }],
  answered_from_documents: true,
  suggest_draft: false,
};

function AnswerCard({ answer = SAMPLE_ANSWER }: { answer?: AskResponse }) {
  const { t } = useApp();
  const source = answer.sources.map((s) => (s.section ? `${s.document} · ${s.section}` : s.document)).join("; ");
  return (
    <article className="answer-card">
      <section><b>{t("answer")}</b><p>{answer.answer}</p></section>
      {answer.what_to_do && <section><b>{t("whatToDo")}</b><p>{answer.what_to_do}</p></section>}
      {answer.cultural_note && <section className="culture"><b>💡 {t("culturalNote")}</b><p>{answer.cultural_note}</p></section>}
      {source && <span className="source">📄 {source}</span>}
    </article>
  );
}

function ChatInput({ onSend, busy = false }: { onSend: (question: string) => void; busy?: boolean }) {
  const { t } = useApp();
  const [value, setValue] = useState("");
  const submit = () => {
    const question = value.trim();
    if (!question || busy) return;
    onSend(question);
    setValue("");
  };
  return (
    <div className="chat-input">
      <input
        aria-label={t("question")}
        value={value}
        placeholder={t("placeholder")}
        maxLength={1000}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <IconButton label={t("mic")}>♩</IconButton>
      <Button onClick={submit} disabled={busy || !value.trim()}>↑</Button>
    </div>
  );
}

type Chat = ReturnType<typeof useChat>;

function TurnView({ turn, onWrite, onRate }: { turn: Turn; onWrite: (prefill: string) => void; onRate: (helpful: boolean) => void }) {
  const { t } = useApp();
  const answer = turn.answer;
  return (
    <div className="conversation">
      <div className="parent-bubble">{turn.question}</div>
      {turn.status === "loading" && <div className="skeleton-card" role="status"><p>{t("reading")}</p><i /><i /><i /></div>}
      {turn.status === "error" && <div className="state-card error" role="alert"><b>! {t("errTitle")}</b><p>{turn.error}</p></div>}
      {answer && (answer.answered_from_documents
        ? <AnswerCard answer={answer} />
        : <article className="unknown-card"><span className="unknown-icon">i</span><div><h3>{t("unknownTitle")}</h3><p>{answer.answer}</p>{answer.what_to_do && <p>{answer.what_to_do}</p>}<Button onClick={() => onWrite(turn.question)}>✉ {t("writeQuestion")}</Button></div></article>)}
      {answer?.answered_from_documents && (
        <div className="answer-actions">
          <Button variant="secondary" onClick={() => onWrite("")}>✉ {t("write")}</Button>
          <div><IconButton label={t("helpful")} onClick={() => onRate(true)}>👍</IconButton><IconButton label={t("notHelpful")} onClick={() => onRate(false)}>👎</IconButton></div>
        </div>
      )}
      {turn.helpful !== undefined && <p className="fresh-note">✓ {t("thanks")}</p>}
    </div>
  );
}

function ParentChat({ chat, go, onWrite }: { chat: Chat; go: Go; onWrite: (prefill: string) => void }) {
  const { t, lang, dir } = useApp();
  const last = chat.turns[chat.turns.length - 1];
  const ask = (question: string) => { void chat.send(question); go("ask"); };
  return (
    <section className="chat-panel" dir={dir}>
      <div className="section-heading">
        <span className="eyebrow">{t("assistant")}</span>
        <h2>{t("askAnything")}</h2>
        <p>{t("askSub")}</p>
      </div>
      <div className="question-chips">
        {suggestedQuestions(lang).map((q) => <button className="chip" key={q} onClick={() => ask(q)}>{q}</button>)}
      </div>
      {last && <TurnView turn={last} onWrite={onWrite} onRate={(helpful) => void chat.rate(last.id, helpful)} />}
      <ChatInput onSend={ask} />
    </section>
  );
}

function weekCard(item: WeekItem, lang: Lang, onAsk: (question: string) => void) {
  const t = (key: Key, vars?: Record<string, string>) => translate(lang, key, vars);
  const when = item.recurring
    ? t("everyDay")
    : [item.date ? formatDay(item.date, lang) : "", item.time ?? ""].filter(Boolean).join(", ");
  const tag = item.type === "deadline" ? <Tag kind="deadline">{t("tagDeadline")}</Tag>
    : item.type === "closure" ? <Tag kind="closed">{t("tagClosed")}</Tag>
    : item.is_new ? <Tag>{t("tagNew")}</Tag>
    : undefined;
  const bring = item.bring.length ? `${t("bringLabel")} ${item.bring.join(", ")}`
    : item.type === "deadline" && item.message ? `${t("todoLabel")} ${item.message}`
    : undefined;
  return (
    <EventCard
      key={`${item.id ?? "x"}-${item.title}`}
      icon={iconFor(item.type, item.title)}
      date={when}
      title={item.title}
      note={item.cultural_note}
      bring={bring}
      tag={tag}
      askLabel={t("askAbout")}
      onAsk={item.type === "event" ? () => onAsk(t("askAboutQuestion", { title: item.title })) : undefined}
    />
  );
}

function Week({ week, retry, onAsk, go }: { week: WeekState; retry: () => void; onAsk: (question: string) => void; go: Go }) {
  const { lang, t, dir } = useApp();
  return (
    <section className="week" dir={dir}>
      <div className="section-heading">
        <span className="eyebrow">{week.status === "ready" ? formatRange(week.data.generated_for, lang) : " "}</span>
        <h2>{t("weekTitle")}</h2>
      </div>
      {week.status === "loading" && <div className="skeleton-card" role="status"><p>{t("weekLoading")}</p><i /><i /><i /></div>}
      {week.status === "error" && (
        <div className="state-card error" role="alert"><b>! {t("errTitle")}</b><p>{week.message}</p><Button variant="secondary" onClick={retry}>{t("retry")}</Button></div>
      )}
      {week.status === "ready" && week.data.items.length === 0 && (
        <div className="state-card"><b>🌻 {t("weekEmptyTitle")}</b><p>{t("weekEmptyText")}</p></div>
      )}
      {week.status === "ready" && week.data.items.map((item) => weekCard(item, lang, onAsk))}
      <Button variant="tertiary" onClick={() => go("calendar")}>{t("seeCalendar")} →</Button>
    </section>
  );
}

function Welcome({ go }: { go: (s: Screen) => void }) {
  return (
    <main className="welcome">
      <Logo />
      <div className="welcome-copy">
        <span className="eyebrow">Welcome · Willkommen</span>
        <h1>Every parent belongs at their child's Kita – in any language.</h1>
        <p>Clear information. Kind answers. Better days together.</p>
      </div>
      <div className="choice-grid">
        <button className="choice-card" onClick={() => go("onboarding")}>
          <div className="illustration parent-illustration" aria-hidden="true"><span>●</span><i>●</i><b>♥</b></div>
          <div><span className="choice-arrow">→</span><h2>I'm a parent</h2><p>See your Kita's news in your language</p></div>
        </button>
        <button className="choice-card staff-card" onClick={() => go("kita-login")}>
          <div className="illustration building-illustration" aria-hidden="true"><span>☀</span><b>⌂</b><i>♧ ♧</i></div>
          <div><span className="choice-arrow">→</span><h2>Ich arbeite in einer Kita</h2><p>Informationen einmal teilen – alle Eltern verstehen sie</p></div>
        </button>
      </div>
      <footer><span>Demo · no real personal data</span><button onClick={() => go("system")}>Design system</button></footer>
    </main>
  );
}

function Onboarding({ go }: { go: Go }) {
  const { t, lang, setLang, languages, profile, saveProfile } = useApp();
  const [parentName, setParentName] = useState(profile?.parentName ?? "");
  const [childName, setChildName] = useState(profile?.childName ?? "");
  const [birthday, setBirthday] = useState(profile?.birthday ?? "");
  const proceed = () => {
    if (!childName.trim()) return;
    saveProfile({ lang, childName: childName.trim(), parentName: parentName.trim(), birthday });
    go("home");
  };
  return (
    <main className="center-page">
      <Logo onClick={() => go("welcome")} />
      <div className="setup-card">
        <div className="progress"><span className="active" /><span className="active" /><span className="active" /><span className="active" /></div>
        <span className="eyebrow">{t("onbEyebrow")}</span>
        <h1>{parentName.trim() ? t("onbTitleName", { name: parentName.trim() }) : t("onbTitle")}</h1>
        <p>{t("onbIntro")}</p>
        <fieldset>
          <legend><span className="step">1</span>{t("yourLanguage")}</legend>
          <div className="language-grid">
            {languages.map((l) => <button type="button" className={lang === l.code ? "selected" : ""} onClick={() => setLang(l.code)} key={l.code}>{l.label}<span>{lang === l.code ? "✓" : ""}</span></button>)}
          </div>
        </fieldset>
        <label><b><span className="step">2</span>{t("yourName")}</b><input value={parentName} maxLength={60} onChange={(e) => setParentName(e.target.value)} /><small>{t("yourNameHelp")}</small></label>
        <label><b><span className="step">3</span>{t("childFirstName")}</b><input placeholder="e.g. Yusuf" value={childName} maxLength={60} onChange={(e) => setChildName(e.target.value)} /><small>{t("childNameHelp")}</small></label>
        <label><b><span className="step">4</span>{t("birthday")}</b><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /><small>{t("birthdayHelp")}</small></label>
        <Button className="full" disabled={!childName.trim()} onClick={proceed}>{t("cont")} <span>→</span></Button>
      </div>
    </main>
  );
}

function Home({ go, chat, onWrite }: { go: Go; chat: Chat; onWrite: (prefill: string) => void }) {
  const { lang, t, dir, profile } = useApp();
  const { state: week, retry } = useWeek(lang);
  const askFromWeek = (question: string) => { void chat.send(question); go("ask"); };
  const name = profile?.parentName.trim();
  const child = profile?.childName.trim();
  return (
    <div className="app-shell" dir={dir}>
      <ParentTop go={go} />
      <main className="parent-main">
        <div className="greeting">
          <div><span className="date">{week.status === "ready" ? formatLong(parseIso(week.data.generated_for), lang) : " "}</span>
          <h1>{name ? t("hello", { name }) : t("helloNoName")} <span aria-hidden="true">👋</span></h1>
          <p>{child ? t("whatsHappening", { child }) : t("whatsHappeningNoChild")}</p></div>
          <div className="weather">☂ <span>{t("weather")}</span></div>
        </div>
        <div className="parent-columns">
          <Week week={week} retry={retry} onAsk={askFromWeek} go={go} />
          <ParentChat chat={chat} go={go} onWrite={onWrite} />
        </div>
      </main>
      <Button className="mobile-chat" onClick={() => go("ask")}>✦ {t("askAnything")}</Button>
    </div>
  );
}

function AskScreen({ go, chat, onWrite }: { go: Go; chat: Chat; onWrite: (prefill: string) => void }) {
  const { lang, t, dir } = useApp();
  const last = chat.turns[chat.turns.length - 1];
  const busy = last?.status === "loading";
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [chat.turns]);
  return (
    <div className="app-shell" dir={dir}>
      <ParentTop go={go} />
      <main className="focused-chat">
        <Button variant="tertiary" onClick={() => go("home")}>{t("backWeek")}</Button>
        <div className="section-heading"><span className="eyebrow">{t("assistant")}</span><h1>{t("askAnything")}</h1><p>{t("askSub")}</p></div>
        {chat.turns.map((turn) => <TurnView key={turn.id} turn={turn} onWrite={onWrite} onRate={(helpful) => void chat.rate(turn.id, helpful)} />)}
        <div className="follow-up">
          <p>{t("tryAnother")}</p>
          {suggestedQuestions(lang).map((q) => <button className="chip" key={q} disabled={busy} onClick={() => void chat.send(q)}>{q}</button>)}
        </div>
        <ChatInput onSend={(question) => void chat.send(question)} busy={busy} />
        <div ref={endRef} />
      </main>
    </div>
  );
}

function Composer({ go, initial, busy, error, onCreate }: { go: Go; initial: string; busy: boolean; error: string | null; onCreate: (message: string) => void }) {
  const { t, lang, profile } = useApp();
  const [message, setMessage] = useState(initial);
  return (
    <div className="overlay-page">
      <div className="overlay-bg" onClick={() => go("home")} />
      <aside className="composer">
        <div className="panel-head"><div><span className="eyebrow">{t("composerEyebrow")}</span><h1>{t("composerTitle")}</h1></div><IconButton label={t("close")} onClick={() => go("home")}>×</IconButton></div>
        <p>{t("composerIntro")}</p>
        <div className="question-chips">{messageTemplates(lang, profile?.childName ?? "").map((x) => <button className="chip" onClick={() => setMessage(x.text)} key={x.label}>{x.label}</button>)}</div>
        <label><b>{t("yourMessage")}</b><textarea value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} /><small>{t("composerHint")}</small></label>
        <div className="privacy-note">✦ <span><b>{t("privacyTitle")}</b><br />{t("privacyText")}</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button className="full" disabled={!message.trim() || busy} onClick={() => onCreate(message)}>{busy ? t("creating") : <>{t("createGerman")} <span>→</span></>}</Button>
      </aside>
    </div>
  );
}

function Result({ go, result }: { go: Go; result: DraftResponse }) {
  const { t, lang } = useApp();
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(result.german_message); setCopied(true); };
  return (
    <div className="overlay-page">
      <div className="overlay-bg" onClick={() => go("home")} />
      <aside className="composer result-panel">
        {copied && <Toast>{t("copied")}</Toast>}
        <div className="panel-head"><div><span className="eyebrow">{t("resultEyebrow")}</span><h1>{t("resultTitle")}</h1></div><IconButton label={t("close")} onClick={() => go("home")}>×</IconButton></div>
        <div className="german-card"><span className="language-label">{t("germanLabel")}</span><p style={{ whiteSpace: "pre-line" }}>{result.german_message}</p></div>
        {lang !== "de" && <div className="translation"><b>{t("whatThisSays")}</b><p style={{ whiteSpace: "pre-line" }}>{result.back_translation}</p></div>}
        <div className="correct">✓ <span><b>{t("correctTitle")}</b><small>{t("correctText")}</small></span></div>
        <Button className="full" onClick={copy}>▣ {t("copy")}</Button>
        <div className="split-actions"><Button variant="secondary" onClick={() => go("composer")}>{t("edit")}</Button><Button variant="tertiary" onClick={() => go("composer")}>{t("startAgain")}</Button></div>
        <Button variant="tertiary" className="back-home" onClick={() => go("home")}>{t("backHome")}</Button>
      </aside>
    </div>
  );
}

function Toast({ children }: { children: ReactNode }) {
  return <div className="toast" role="status"><span>✓</span>{children}</div>;
}

function Settings({ go, onDeleted }: { go: Go; onDeleted: () => void }) {
  const { t, lang, languages, profile, saveProfile, clearProfile } = useApp();
  const [form, setForm] = useState({ lang, parentName: profile?.parentName ?? "", childName: profile?.childName ?? "", birthday: profile?.birthday ?? "" });
  const [saved, setSaved] = useState(false);
  const change = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setSaved(false); };
  return (
    <div className="app-shell"><ParentTop go={go} /><main className="settings-page"><Button variant="tertiary" onClick={() => go("home")}>{t("back")}</Button><h1>{t("settingsTitle")}</h1>
      <div className="settings-card">
        <label><b>{t("language")}</b><select value={form.lang} onChange={(e) => change({ lang: e.target.value as Lang })}>{languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
        <label><b>{t("parentName")}</b><input value={form.parentName} maxLength={60} onChange={(e) => change({ parentName: e.target.value })} /></label>
        <label><b>{t("childName")}</b><input value={form.childName} maxLength={60} onChange={(e) => change({ childName: e.target.value })} /></label>
        <label><b>{t("birthday")}</b><input type="date" value={form.birthday} onChange={(e) => change({ birthday: e.target.value })} /><small>{t("birthdayHelp")}</small></label>
        <Button disabled={!form.childName.trim()} onClick={() => { saveProfile({ ...form, childName: form.childName.trim(), parentName: form.parentName.trim() }); setSaved(true); }}>{t("save")}</Button>
        {saved && <p className="fresh-note">✓ {t("saved")}</p>}
        <hr /><p>{t("noStore")}</p>
        <Button variant="danger" onClick={() => { if (window.confirm(t("deleteConfirm"))) { clearProfile(); onDeleted(); } }}>{t("deleteData")}</Button>
      </div>
    </main></div>
  );
}

function StaffLayout({ go, active, children, toast }: { go: (s: Screen) => void; active: string; children: ReactNode; toast?: ReactNode }) {
  const nav = [["📢", "Aushänge", "dashboard"], ["📄", "Dokumente", "documents"], ["👨‍👩‍👧", "Eltern", "parents"], ["⚙", "Einstellungen", "dashboard"]];
  return <div className="staff-shell">
    <header className="staff-top"><Logo onClick={() => go("welcome")} /><span>Kita Sonnenblume <i /> Team-Bereich</span><div className="user"><span>FW</span><b>Frau Weber</b><span>⌄</span></div></header>
    <aside className="sidebar"><nav>{nav.map(([icon, name, screen]) => <button className={active === name ? "active" : ""} onClick={() => go(screen as Screen)} key={name}><span>{icon}</span>{name}</button>)}</nav><div className="sidebar-help"><b>Hilfe benötigt?</b><p>Wir sind für Sie da.</p><button>Hilfe öffnen →</button></div></aside>
    <main className="staff-main">{toast}{children}</main>
  </div>;
}

function KitaLogin({ go, onLoggedIn }: { go: Go; onLoggedIn: () => void }) {
  const [code, setCode] = useState("SONNE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.staffLogin(code.trim());
      api.staffToken.set(token);
      onLoggedIn();
      go("dashboard");
    } catch (e) {
      setError(e instanceof api.ApiError && e.code === "unauthorized" ? "Kita-Code nicht gefunden. Bitte prüfen Sie den Code." : errorText(e, "de"));
    } finally {
      setBusy(false);
    }
  };
  return <main className="login-page"><Logo onClick={() => go("welcome")} /><div className="login-card"><div className="login-mark">⌂</div><span className="eyebrow">Kita Companion</span><h1>Für Kita-Teams</h1><p>Teilen Sie Informationen einmal.<br />Alle Eltern verstehen sie.</p>
    <label><b>Kita-Code</b><input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button className="full" disabled={busy} onClick={() => void submit()}>{busy ? "Einen Moment …" : <>Anmelden <span>→</span></>}</Button><small>Demo-Zugang · Keine echten Daten</small></div></main>;
}

// ---------- announcements (staff) ----------

type FormState = { type: ItemType; title: string; message: string; date: string; time: string; daily: boolean; hasDeadline: boolean; deadline: string; bring: string };
const EMPTY_FORM: FormState = { type: "event", title: "", message: "", date: "", time: "", daily: false, hasDeadline: false, deadline: "", bring: "" };
const TYPES: [ItemType, string, string][] = [["event", "Veranstaltung", "☆"], ["closure", "Kita geschlossen", "⊘"], ["deadline", "Frist", "!"], ["reminder", "Erinnerung", "↻"]];

function toInput(f: FormState): AnnouncementIn {
  return {
    type: f.type,
    title: f.title.trim(),
    message: f.message.trim(),
    starts_on: f.daily ? null : f.date || null,
    time: f.time || null,
    deadline_on: f.hasDeadline && f.deadline ? f.deadline : null,
    bring: f.bring.split(",").map((s) => s.trim()).filter(Boolean),
    recurring: f.daily ? "daily" : null,
  };
}

function fromAnnouncement(a: Announcement): FormState {
  return {
    type: a.type, title: a.title, message: a.message, date: a.starts_on ?? "", time: a.time ?? "",
    daily: a.recurring === "daily", hasDeadline: !!a.deadline_on, deadline: a.deadline_on ?? "", bring: a.bring.join(", "),
  };
}

function validate(f: FormState): string | null {
  if (!f.title.trim()) return "Bitte geben Sie einen Titel ein.";
  if (!f.daily && !f.date) return "Bitte wählen Sie ein Datum.";
  if (f.hasDeadline && !f.deadline) return "Bitte wählen Sie das Datum der Frist.";
  return null;
}

function useEditorState(refresh: () => void) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, Translation> | null>(null);

  const reset = () => { setForm(EMPTY_FORM); setEditingId(null); setError(null); setPreview(null); };
  const startEdit = (a: Announcement) => { setForm(fromAnnouncement(a)); setEditingId(a.id); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const runPreview = async (): Promise<boolean> => {
    const problem = validate(form);
    if (problem) { setError(problem); return false; }
    setBusy(true);
    setError(null);
    try {
      setPreview((await api.previewAnnouncement(toInput(form))).translations);
      return true;
    } catch (e) {
      setError(errorText(e, "de"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (): Promise<boolean> => {
    const problem = validate(form);
    if (problem) { setError(problem); return false; }
    setBusy(true);
    setError(null);
    try {
      if (editingId) await api.updateAnnouncement(editingId, toInput(form));
      else await api.createAnnouncement(toInput(form));
      reset();
      refresh();
      return true;
    } catch (e) {
      setError(errorText(e, "de"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { form, setForm, editingId, busy, error, preview, reset, startEdit, runPreview, publish };
}
type Editor = ReturnType<typeof useEditorState>;

const isNew = (a: Announcement) => Date.now() - Date.parse(a.published_at) < 48 * 3600 * 1000;

function dateLabel(a: Announcement): string {
  if (a.recurring === "daily") return "Täglich";
  if (a.type === "deadline" && a.deadline_on) return `Frist ${formatDay(a.deadline_on, "de")}`;
  return [a.starts_on ? formatDay(a.starts_on, "de") : "", a.time ?? ""].filter(Boolean).join(", ");
}

function AnnouncementList({ items, error, onEdit, onDelete }: { items: Announcement[] | null; error: string | null; onEdit: (a: Announcement) => void; onDelete: (a: Announcement) => void }) {
  return <section className="announcement-section"><div className="list-title"><h2>Aktuelle Aushänge</h2><span>{items?.length ?? 0} aktiv</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {items && items.length === 0 && <div className="state-card"><b>📢 Noch keine Aushänge</b><p>Schreiben Sie den ersten!</p></div>}
    <div className="announcement-list">{items?.map((a) => <article key={a.id} className={isNew(a) ? "new-item" : ""}><span className="list-icon">{iconFor(a.type, a.title)}</span><div><div className="status-line"><h3>{a.title}</h3>{isNew(a) && <Tag>Neu</Tag>}<Tag kind="success">✓ Veröffentlicht</Tag></div><p>{dateLabel(a)}</p></div><IconButton label="Bearbeiten" onClick={() => onEdit(a)}>✎</IconButton><IconButton label="Löschen" onClick={() => onDelete(a)}>⌫</IconButton></article>)}</div></section>;
}

function AnnouncementForm({ editor, go }: { editor: Editor; go: Go }) {
  const { form, setForm, editingId, busy, error } = editor;
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  return <section className="form-card"><div className="form-title"><div className="round-icon">＋</div><div><h2>{editingId ? "Aushang bearbeiten" : "Neuer Aushang"}</h2><p>In weniger als einer Minute veröffentlicht.</p></div></div>
    <div className="form-grid">
      <label className="wide"><b>Titel</b><input value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></label>
      <label><b>Datum und Uhrzeit</b><span className="inline-fields"><input type="date" aria-label="Datum" disabled={form.daily} value={form.date} onChange={(e) => set({ date: e.target.value })} /><input type="time" aria-label="Uhrzeit" value={form.time} onChange={(e) => set({ time: e.target.value })} /></span></label>
      <label className="wide"><b>Nachricht an die Eltern <small>(auf Deutsch, in einfachen Worten)</small></b><textarea value={form.message} maxLength={1000} onChange={(e) => set({ message: e.target.value })} /></label>
      <label><b>Bitte mitbringen <small>(optional, mit Komma trennen)</small></b><input value={form.bring} onChange={(e) => set({ bring: e.target.value })} /></label>
      <label className="check-label"><input type="checkbox" checked={form.hasDeadline} onChange={(e) => set({ hasDeadline: e.target.checked })} /> <b>Mit Frist</b><input type="date" aria-label="Frist" disabled={!form.hasDeadline} value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} /></label>
    </div>
    <fieldset className="type-select"><legend>Art des Aushangs</legend>{TYPES.map(([type, label, icon]) => <button type="button" className={form.type === type ? "selected" : ""} onClick={() => set({ type, daily: type === "reminder" ? form.daily : false })} key={type}>{icon} {label}</button>)}</fieldset>
    {form.type === "reminder" && <label className="check-label"><input type="checkbox" checked={form.daily} onChange={(e) => set({ daily: e.target.checked })} /> <b>Täglich wiederholen</b></label>}
    <div className="globe-info">◎ <span><b>Automatisch auf Englisch und einfachem Deutsch</b><br />Eltern sehen diesen Aushang in ihrer Sprache.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">
      <Button variant="secondary" disabled={busy} onClick={() => void editor.runPreview().then((ok) => ok && go("preview"))}>⊙ Vorschau für Eltern</Button>
      <Button disabled={busy} onClick={() => void editor.publish().then((ok) => ok && go("published"))}>{busy ? "Wird übersetzt …" : editingId ? "Speichern →" : "Veröffentlichen →"}</Button>
      {editingId && <Button variant="tertiary" disabled={busy} onClick={editor.reset}>Abbrechen</Button>}
    </div>
  </section>;
}

function Dashboard({ go, published, editor, version, bump }: { go: Go; published: boolean; editor: Editor; version: number; bump: () => void }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [families, setFamilies] = useState<number | null>(null);
  useEffect(() => {
    let off = false;
    api.listAnnouncements().then((r) => { if (!off) { setItems(r); setLoadError(null); } }).catch((e) => { if (!off) setLoadError(errorText(e, "de")); });
    return () => { off = true; };
  }, [version]);
  useEffect(() => { api.insights().then((i) => setFamilies(i.families)).catch(() => {}); }, []);
  const remove = async (a: Announcement) => {
    if (!window.confirm(`„${a.title}“ wirklich löschen?`)) return;
    try { await api.deleteAnnouncement(a.id); bump(); } catch (e) { setLoadError(errorText(e, "de")); }
  };
  return <StaffLayout go={go} active="Aushänge" toast={published ? <><Toast>Veröffentlicht! Eltern sehen den Aushang jetzt auf Englisch und Deutsch.</Toast><button className="cross-link" onClick={() => go("home")}>Elternansicht öffnen →</button></> : undefined}>
    <div className="page-title"><div><span className="eyebrow">{formatLong(new Date(), "de")}</span><h1>Guten Morgen, Frau Weber</h1><p>Was möchten Sie heute mit den Eltern teilen?</p></div>{families !== null && <span className="mini-stat">● <b>{families} {families === 1 ? "Familie" : "Familien"}</b> aktiv</span>}</div>
    <AnnouncementForm editor={editor} go={go} /><AnnouncementList items={items} error={loadError} onEdit={editor.startEdit} onDelete={(a) => void remove(a)} />
  </StaffLayout>;
}

function Preview({ go, editor }: { go: Go; editor: Editor }) {
  const [tab, setTab] = useState<Lang>("en");
  const tabLabels: Record<string, string> = { en: "Englisch", de: "Deutsch" };
  const tabs = Object.keys(editor.preview ?? {}).filter((k): k is Lang => k === "en" || k === "de");
  const tr = editor.preview?.[tab];
  const input = toInput(editor.form);
  const when = input.recurring ? translate(tab, "everyDay") : [input.starts_on ? formatDay(input.starts_on, tab) : "", input.time ?? ""].filter(Boolean).join(", ");
  return <div className="modal-layer"><div className="preview-modal"><div className="panel-head"><div><span className="eyebrow">Vorschau</span><h1>So sehen es die Eltern</h1></div><IconButton label="Schließen" onClick={() => go("dashboard")}>×</IconButton></div>
    <div className="tabs">{tabs.map((x) => <button className={tab === x ? "active" : ""} onClick={() => setTab(x)} key={x}>{tabLabels[x]}</button>)}</div>
    <div className="preview-canvas"><span className="preview-lang">◎ {tabLabels[tab]}</span>{tr && <EventCard icon={iconFor(input.type, input.title)} date={when} title={tr.title} bring={tr.bring.length ? `${translate(tab, "bringLabel")} ${tr.bring.join(", ")}` : undefined} note={tr.cultural_note} tag={<Tag>{translate(tab, "tagNew")}</Tag>} />}</div>
    <p className="auto-note">✦ Die kulturellen Erklärungen werden automatisch ergänzt.</p>
    {editor.error && <p className="form-error" role="alert">{editor.error}</p>}
    <div className="form-actions"><Button variant="secondary" onClick={() => go("dashboard")}>← Zurück bearbeiten</Button><Button disabled={editor.busy} onClick={() => void editor.publish().then((ok) => ok && go("published"))}>{editor.busy ? "Wird veröffentlicht …" : "Veröffentlichen →"}</Button></div>
  </div></div>;
}

// ---------- documents and insights (staff) ----------

const docIcon = (name: string) =>
  name.startsWith("letters/") ? "✉️" : /rules|haus/i.test(name) ? "📋" : /calendar|kalender/i.test(name) ? "🗓️" : /handbook|handbuch/i.test(name) ? "📘" : "📄";

function Documents({ go, onEdit }: { go: Go; onEdit: (name: string) => void }) {
  const [docs, setDocs] = useState<DocumentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.listDocuments().then(setDocs).catch((e) => setError(errorText(e, "de"))); }, []);
  const add = () => {
    const name = window.prompt("Dateiname des neuen Dokuments (.md), z. B. letters/fotograf.md");
    if (name?.trim()) onEdit(name.trim());
  };
  return <StaffLayout go={go} active="Dokumente"><div className="page-title"><div><span className="eyebrow">Wissensbasis</span><h1>Dokumente der Kita</h1><p>Aus diesen Dokumenten beantwortet die App die Fragen der Eltern. Halten Sie sie aktuell.</p></div><Button onClick={add}>＋ Dokument hinzufügen</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="document-grid">{docs?.map((d) => <article className="document-card" key={d.name}><span>{docIcon(d.name)}</span><div><h2>{d.title}</h2><p>{d.name} · aktualisiert {formatShortDate(d.updated_at, "de")} · {Math.max(1, Math.round(d.size / 1024))} KB</p></div><Button variant="secondary" onClick={() => onEdit(d.name)}>Bearbeiten</Button></article>)}</div>
    <div className="safe-card">✓ <div><b>Die Antworten bleiben verlässlich</b><p>Die App nutzt nur die Dokumente Ihrer Kita. Sie erfindet keine Informationen.</p></div></div></StaffLayout>;
}

function Editor({ go, name }: { go: Go; name: string }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    api.getDocument(name)
      .then((d) => { if (!off) { setContent(d.content); setLoaded(true); } })
      .catch((e) => {
        if (off) return;
        if (e instanceof api.ApiError && e.code === "not_found") { setContent("# \n\n"); setLoaded(true); } // a new document
        else setError(errorText(e, "de"));
      });
    return () => { off = true; };
  }, [name]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try { await api.putDocument(name, content); setSaved(true); } catch (e) { setError(errorText(e, "de")); } finally { setBusy(false); }
  };
  const title = content.split("\n").find((l) => l.startsWith("# "))?.slice(2).trim() || name;
  return <StaffLayout go={go} active="Dokumente" toast={saved ? <Toast>Gespeichert. Die App nutzt ab jetzt die neue Version.</Toast> : undefined}><button className="breadcrumb" onClick={() => go("documents")}>Dokumente <span>›</span> {title}</button><div className="editor-head"><div><span className="doc-large">{docIcon(name)}</span><div><h1>{title}</h1><p>{name}</p></div></div><Tag kind="success">● Aktiv</Tag></div><section className="editor-card"><label><b>Inhalt des Dokuments</b><textarea value={content} disabled={!loaded} onChange={(e) => { setContent(e.target.value); setSaved(false); }} /></label><p className="editor-hint">✦ Änderungen stehen den Eltern direkt nach dem Speichern zur Verfügung.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={() => go("documents")}>Abbrechen</Button><Button disabled={!loaded || busy || !content.trim()} onClick={() => void save()}>{busy ? "Speichern …" : "Speichern"}</Button></div></section></StaffLayout>;
}

function Parents({ go }: { go: Go }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.insights().then(setData).catch((e) => setError(errorText(e, "de"))); }, []);
  const names: Record<string, string> = { en: "Englisch", de: "Deutsch" };
  const max = Math.max(1, ...(data?.languages.map((l) => l.count) ?? [1]));
  return <StaffLayout go={go} active="Eltern"><div className="page-title"><div><span className="eyebrow">Anonym & geschützt</span><h1>Eltern-Übersicht</h1><p>Sehen Sie, welche Informationen Familien gerade brauchen.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && <>
      <div className="stat-grid"><article><span>👨‍👩‍👧</span><b>{data.families}</b><p>Familien aktiv</p></article><article><span>◎</span><b>{data.languages.length}</b><p>Sprachen</p></article><article><span>?</span><b>{data.questions_this_week}</b><p>Fragen diese Woche</p></article></div>
      <div className="analytics-grid"><section className="analytics-card"><h2>Sprachen der Familien</h2>{data.languages.length === 0 && <p>Noch keine Fragen.</p>}{data.languages.map((l) => <div className="bar-row" key={l.lang}><span>{names[l.lang] ?? l.lang}</span><div><i style={{ width: `${(l.count / max) * 100}%` }} /></div><b>{l.count}</b></div>)}</section>
      <section className="analytics-card"><h2>Häufige Fragen diese Woche</h2>{data.top_questions.length === 0 && <p>Noch keine Fragen.</p>}{data.top_questions.map((q, i) => <div className="question-row" key={q.text}><span>{i + 1}</span><p>{q.text}</p><b>{q.count}×</b></div>)}<div className="tip">💡 <span><b>Tipp</b><br />Ergänzen Sie diese Infos im Elternhandbuch.</span></div></section></div>
      <section className="unanswered"><div><h2>Fragen ohne Antwort in den Dokumenten</h2><p>Diese Fragen wurden anonym zusammengefasst.</p></div>{data.unanswered.length === 0 && <p>Alle Fragen konnten beantwortet werden.</p>}{data.unanswered.map((q, i) => <article key={q.text}><span>{i + 1}</span><p>„{q.text}“</p><Button variant="secondary" onClick={() => go("documents")}>Zum Dokument →</Button></article>)}</section>
    </>}
    <p className="anonymous-note">⌾ Keine Namen, keine persönlichen Daten.</p>
  </StaffLayout>;
}

const calendarEvents: Record<number, { icon: string; title: string; time: string; kind: string }> = {
  4: { icon: "⚠️", title: "Trip permission slip", time: "Due today", kind: "Deadline" },
  5: { icon: "🏮", title: "Lantern walk (Laternenfest)", time: "17:00", kind: "Event" },
  6: { icon: "📅", title: "Kita closed", time: "All day", kind: "Closed" },
};

function Calendar({ go }: { go: (s: Screen) => void }) {
  const [month, setMonth] = useState(10);
  const [selected, setSelected] = useState(5);
  const year = 2026;
  const monthName = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const days = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const event = month === 10 ? calendarEvents[selected] : undefined;
  return (
    <div className="app-shell">
      <ParentTop go={go} />
      <main className="calendar-page">
        <Button variant="tertiary" onClick={() => go("home")}>← Back to home</Button>
        <div className="calendar-heading">
          <div><span className="eyebrow">Kita Sonnenblume</span><h1>Calendar</h1><p>Events, deadlines and closed days in one place.</p></div>
          <Button variant="secondary" onClick={() => { setMonth(10); setSelected(2); }}>Today · 2 Nov</Button>
        </div>
        <div className="calendar-layout">
          <section className="calendar-card">
            <div className="month-nav">
              <IconButton label="Previous month" onClick={() => { setMonth(value => value === 0 ? 11 : value - 1); setSelected(1); }}>←</IconButton>
              <h2>{monthName}</h2>
              <IconButton label="Next month" onClick={() => { setMonth(value => value === 11 ? 0 : value + 1); setSelected(1); }}>→</IconButton>
            </div>
            <div className="weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {Array.from({ length: mondayOffset }).map((_, index) => <span className="blank-day" key={`blank-${index}`} />)}
              {Array.from({ length: days }).map((_, index) => {
                const day = index + 1;
                const dayEvent = month === 10 ? calendarEvents[day] : undefined;
                return <button className={`${selected === day ? "selected" : ""} ${day === 2 && month === 10 ? "today" : ""}`} onClick={() => setSelected(day)} key={day}><span>{day}</span>{dayEvent && <i aria-label={dayEvent.title}>{dayEvent.icon}</i>}</button>;
              })}
            </div>
          </section>
          <aside className="calendar-detail">
            <span className="eyebrow">{selected} {monthName}</span>
            {event ? <>
              <div className="detail-icon">{event.icon}</div>
              <Tag kind={event.kind === "Deadline" ? "deadline" : event.kind === "Closed" ? "closed" : "new"}>{event.kind}</Tag>
              <h2>{event.title}</h2>
              <p className="detail-time">{event.time}</p>
              {selected === 5 && <><div className="culture"><span>💡</span><p>A German autumn tradition: children walk through the streets with lanterns and sing songs. Parents usually come along.</p></div><p><b>Bring:</b> a homemade lantern</p><Button className="full" onClick={() => go("ask")}>Ask about this →</Button></>}
              {selected === 4 && <p>Sign the paper and give it to the teacher.</p>}
              {selected === 6 && <p>Please plan other childcare for this day.</p>}
            </> : <div className="no-event"><span>🌻</span><h3>No Kita events</h3><p>There is nothing planned for this day.</p></div>}
          </aside>
        </div>
      </main>
    </div>
  );
}
function DesignSystem({ go }: { go: (s: Screen) => void }) {
  return <main className="system-page"><div className="system-head"><Logo onClick={() => go("welcome")} /><Button variant="secondary" onClick={() => go("welcome")}>← Back to prototype</Button></div><span className="eyebrow">Shared foundation</span><h1>Kita Companion design system</h1><p>Warm, calm, trustworthy and inclusive. Built for quick understanding in LTR and RTL.</p>
    <section><h2>Colour & type</h2><div className="swatches">{[["Warm canvas", "#FBF8F3"], ["Sunflower", "#F2B705"], ["Deep teal", "#2F8F83"], ["Ink", "#1F2A2E"], ["Lavender", "#F1EDFB"], ["Success", "#2E9E5B"]].map(x => <div key={x[0]}><i style={{ background: x[1] }} /><b>{x[0]}</b><small>{x[1]}</small></div>)}</div></section>
    <section><h2>Actions & status</h2><div className="component-row"><Button>Primary action</Button><Button variant="secondary">Secondary</Button><Button variant="tertiary">Tertiary link</Button><Tag kind="deadline">⚠ Deadline</Tag><Tag kind="closed">⊘ Closed</Tag><Tag>New</Tag><Tag kind="success">✓ Published</Tag></div></section>
    <section><h2>Core components</h2><div className="system-grid"><EventCard icon="🏮" date="Thu 5 Nov, 17:00" title="Lantern walk (Laternenfest)" bring="Bring: a homemade lantern" note="A German autumn tradition. Parents usually come along." tag={<Tag>New</Tag>} /><AnswerCard /></div></section>
    <section><h2>Parent states</h2><div className="state-grid"><div className="skeleton-card"><p>Reading your Kita's documents…</p><i /><i /><i /></div><div className="state-card"><b>🌻 No news this week</b><p>New information will appear here.</p></div><div className="state-card error"><b>! Something went wrong</b><p>Please try again in a moment.</p></div><div className="state-card"><b>⌂ Kita code not found</b><p>We can't find this Kita code. Please check with your Kita.</p></div></div></section>
    <section><h2>Kita staff states</h2><div className="state-grid"><div className="state-card"><b>📢 Noch keine Aushänge</b><p>Schreiben Sie den ersten!</p></div><div className="state-card error"><b>! Etwas ist schiefgelaufen</b><p>Bitte versuchen Sie es gleich noch einmal.</p></div><div className="state-card"><b>⌂ Kita-Code nicht gefunden</b><p>Bitte prüfen Sie den Code und versuchen Sie es erneut.</p></div><div className="state-card"><b>✓ Gespeichert</b><p>Die App nutzt ab jetzt die neue Version.</p></div></div></section>
  </main>;
}

const STAFF_SCREENS: Screen[] = ["dashboard", "preview", "published", "documents", "editor", "parents"];

function Shell() {
  const app = useApp();
  const [screen, setScreen] = useState<Screen>("welcome");
  const go: Go = (next) => { setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const chat = useChat(app.lang);

  const [authed, setAuthed] = useState(() => !!api.staffToken.get());
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const editor = useEditorState(bump);
  const [docName, setDocName] = useState("house-rules.md");

  const [draftText, setDraftText] = useState("");
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const openComposer = (prefill: string) => {
    setDraftText(prefill);
    setDraft(null);
    setDraftError(null);
    setComposerKey((k) => k + 1);
    go("composer");
  };

  const createDraft = async (text: string) => {
    setDraftText(text);
    setDrafting(true);
    setDraftError(null);
    try {
      setDraft(await api.draftMessage(text, app.lang, app.profile?.childName, app.profile?.parentName));
      go("result");
    } catch (e) {
      setDraftError(errorText(e, app.lang));
    } finally {
      setDrafting(false);
    }
  };

  const current: Screen = STAFF_SCREENS.includes(screen) && !authed ? "kita-login" : screen;
  const dashboard = (published: boolean) => <Dashboard go={go} published={published} editor={editor} version={version} bump={bump} />;

  switch (current) {
    case "welcome": return <Welcome go={(s) => go(s === "onboarding" && app.profile ? "home" : s)} />;
    case "onboarding": return <Onboarding go={go} />;
    case "home": return <Home go={go} chat={chat} onWrite={openComposer} />;
    case "ask": return <AskScreen go={go} chat={chat} onWrite={openComposer} />;
    case "composer": return <Composer key={composerKey} go={go} initial={draftText} busy={drafting} error={draftError} onCreate={(m) => void createDraft(m)} />;
    case "result": return draft ? <Result go={go} result={draft} /> : <Home go={go} chat={chat} onWrite={openComposer} />;
    case "settings": return <Settings go={go} onDeleted={() => { chat.reset(); setDraft(null); go("welcome"); }} />;
    case "kita-login": return <KitaLogin go={go} onLoggedIn={() => setAuthed(true)} />;
    case "dashboard": return dashboard(false);
    case "published": return dashboard(true);
    case "preview": return editor.preview ? <Preview go={go} editor={editor} /> : dashboard(false);
    case "documents": return <Documents go={go} onEdit={(name) => { setDocName(name); go("editor"); }} />;
    case "editor": return <Editor key={docName} go={go} name={docName} />;
    case "parents": return <Parents go={go} />;
    case "system": return <DesignSystem go={go} />;
    case "calendar": return <Calendar go={go} />;
  }
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
