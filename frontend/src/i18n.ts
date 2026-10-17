// UI text for the parent screens in the two supported languages (English, German).
// Kita staff screens are always German and keep their text inline in App.tsx.
import { ApiError, type ItemType, type Lang } from "./api";

const en = {
  settings: "Settings",
  question: "Question",
  placeholder: "Ask a question in your language…",
  mic: "Microphone coming soon",
  send: "Send",

  hello: "Hello {name}",
  helloNoName: "Hello",
  whatsHappening: "Here is what's happening at {child}'s Kita.",
  whatsHappeningNoChild: "Here is what's happening at your Kita.",
  weather: "Light rain · 9°",

  weekTitle: "This week",
  seeCalendar: "See full calendar",
  askAbout: "Ask about this",
  askAboutQuestion: 'What do I need to know about "{title}"?',
  everyDay: "Every day",
  bringLabel: "Bring:",
  todoLabel: "What to do:",
  tagNew: "New",
  tagDeadline: "Deadline",
  tagClosed: "Closed",
  weekEmptyTitle: "No news this week",
  weekEmptyText: "New information will appear here.",
  weekLoading: "Loading this week…",
  retry: "Try again",

  assistant: "Kita assistant",
  askAnything: "Ask anything",
  askSub: "Ask in your language. Answers come only from your Kita's documents.",
  answer: "Answer",
  whatToDo: "What to do",
  culturalNote: "Cultural note",
  write: "Write to the Kita",
  writeQuestion: "Write this question to the Kita",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  thanks: "Thanks for your feedback",
  backWeek: "← Back to this week",
  reading: "Reading your Kita's documents…",
  tryAnother: "Try another question",
  errTitle: "Something went wrong",
  unknownTitle: "This is not in the Kita's documents",

  composerEyebrow: "Message helper",
  composerTitle: "Write to the Kita",
  composerIntro: "Write in your language. We'll turn it into polite German.",
  yourMessage: "Your message",
  composerHint: "Write naturally. Short sentences are best.",
  privacyTitle: "Your words stay private",
  privacyText: "We only use them to make this message.",
  createGerman: "Create message in German",
  creating: "Creating your message…",
  close: "Close",

  resultEyebrow: "Ready to send",
  resultTitle: "Your message in German",
  germanLabel: "DE · German",
  whatThisSays: "What this says:",
  correctTitle: "Polite German.",
  correctText: "Ready to copy into email or WhatsApp.",
  copy: "Copy message",
  copied: "Copied! You can send it by email or WhatsApp.",
  edit: "Edit",
  startAgain: "Start again",
  backHome: "← Back to home",

  settingsTitle: "Settings",
  language: "Language",
  parentName: "Your first name (optional)",
  childName: "Child's first name",
  birthday: "Child's birthday",
  birthdayHelp: "This helps us show the right child if you have more than one child at the Kita. It stays on this device.",
  save: "Save changes",
  saved: "Saved.",
  noStore: "We don't store your questions with your name.",
  deleteData: "Delete my data",
  deleteConfirm: "Delete your saved settings on this device?",
  back: "← Back",

  onbEyebrow: "A quick start",
  onbTitle: "Welcome",
  onbTitleName: "Welcome, {name}",
  onbIntro: "Choose your language and tell us which child you want to see.",
  yourLanguage: "Your language",
  yourName: "Your first name",
  yourNameHelp: "Optional. Used to sign your messages to the Kita.",
  childFirstName: "Your child's first name",
  childNameHelp: "Used to personalize your Kita information and messages.",
  cont: "Continue",
};

export type Key = keyof typeof en;

const de: Record<Key, string> = {
  settings: "Einstellungen",
  question: "Frage",
  placeholder: "Stellen Sie eine Frage …",
  mic: "Mikrofon bald verfügbar",
  send: "Senden",

  hello: "Hallo {name}",
  helloNoName: "Hallo",
  whatsHappening: "Das passiert gerade in der Kita von {child}.",
  whatsHappeningNoChild: "Das passiert gerade in Ihrer Kita.",
  weather: "Leichter Regen · 9°",

  weekTitle: "Diese Woche",
  seeCalendar: "Ganzen Kalender ansehen",
  askAbout: "Dazu fragen",
  askAboutQuestion: 'Was muss ich zu „{title}“ wissen?',
  everyDay: "Jeden Tag",
  bringLabel: "Mitbringen:",
  todoLabel: "Das ist zu tun:",
  tagNew: "Neu",
  tagDeadline: "Frist",
  tagClosed: "Geschlossen",
  weekEmptyTitle: "Keine Neuigkeiten diese Woche",
  weekEmptyText: "Neue Informationen erscheinen hier.",
  weekLoading: "Diese Woche wird geladen …",
  retry: "Erneut versuchen",

  assistant: "Kita-Assistent",
  askAnything: "Fragen Sie einfach",
  askSub: "Fragen Sie in Ihrer Sprache. Antworten kommen nur aus den Dokumenten Ihrer Kita.",
  answer: "Antwort",
  whatToDo: "Das ist zu tun",
  culturalNote: "Kulturelle Info",
  write: "An die Kita schreiben",
  writeQuestion: "Diese Frage an die Kita schreiben",
  helpful: "Hilfreich",
  notHelpful: "Nicht hilfreich",
  thanks: "Danke für Ihr Feedback",
  backWeek: "← Zurück zu dieser Woche",
  reading: "Die Dokumente Ihrer Kita werden gelesen …",
  tryAnother: "Weitere Frage ausprobieren",
  errTitle: "Etwas ist schiefgelaufen",
  unknownTitle: "Das steht nicht in den Dokumenten der Kita",

  composerEyebrow: "Nachrichten-Hilfe",
  composerTitle: "An die Kita schreiben",
  composerIntro: "Schreiben Sie in Ihrer Sprache. Wir machen daraus höfliches Deutsch.",
  yourMessage: "Ihre Nachricht",
  composerHint: "Schreiben Sie ganz natürlich. Kurze Sätze sind am besten.",
  privacyTitle: "Ihre Worte bleiben privat",
  privacyText: "Wir nutzen sie nur für diese Nachricht.",
  createGerman: "Nachricht auf Deutsch erstellen",
  creating: "Ihre Nachricht wird erstellt …",
  close: "Schließen",

  resultEyebrow: "Bereit zum Senden",
  resultTitle: "Ihre Nachricht auf Deutsch",
  germanLabel: "DE · Deutsch",
  whatThisSays: "Das steht darin:",
  correctTitle: "Höfliches Deutsch.",
  correctText: "Bereit zum Kopieren in E-Mail oder WhatsApp.",
  copy: "Nachricht kopieren",
  copied: "Kopiert! Sie können sie per E-Mail oder WhatsApp senden.",
  edit: "Bearbeiten",
  startAgain: "Neu beginnen",
  backHome: "← Zurück zur Startseite",

  settingsTitle: "Einstellungen",
  language: "Sprache",
  parentName: "Ihr Vorname (optional)",
  childName: "Vorname des Kindes",
  birthday: "Geburtstag des Kindes",
  birthdayHelp: "So zeigen wir das richtige Kind, wenn Sie mehr als ein Kind in der Kita haben. Er bleibt auf diesem Gerät.",
  save: "Änderungen speichern",
  saved: "Gespeichert.",
  noStore: "Wir speichern Ihre Fragen nicht mit Ihrem Namen.",
  deleteData: "Meine Daten löschen",
  deleteConfirm: "Gespeicherte Einstellungen auf diesem Gerät löschen?",
  back: "← Zurück",

  onbEyebrow: "Schnell loslegen",
  onbTitle: "Willkommen",
  onbTitleName: "Willkommen, {name}",
  onbIntro: "Wählen Sie Ihre Sprache und sagen Sie uns, welches Kind Sie sehen möchten.",
  yourLanguage: "Ihre Sprache",
  yourName: "Ihr Vorname",
  yourNameHelp: "Optional. Wird zum Unterschreiben Ihrer Nachrichten an die Kita genutzt.",
  childFirstName: "Vorname Ihres Kindes",
  childNameHelp: "Damit personalisieren wir Kita-Infos und Nachrichten.",
  cont: "Weiter",
};

const dictionaries: Record<Lang, Record<Key, string>> = { en, de };

export function translate(lang: Lang, key: Key, vars: Record<string, string> = {}): string {
  return dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

export function suggestedQuestions(lang: Lang): string[] {
  return lang === "de"
    ? ["Was muss ich morgen mitbringen?", "Mein Kind ist krank, was mache ich?", "Was ist Eingewöhnung?", "Wann öffnet die Kita?"]
    : ["What do I bring tomorrow?", "My child is sick, what do I do?", "What is Eingewöhnung?", "When does the Kita open?"];
}

/** Starter texts for the message helper; the parent can edit them freely. */
export function messageTemplates(lang: Lang, child: string): { label: string; text: string }[] {
  const name = child.trim();
  if (lang === "de") {
    const who = name || "Mein Kind";
    return [
      { label: "Mein Kind kommt später", text: `${who} kommt morgen später, wir haben einen Arzttermin.` },
      { label: "Mein Kind ist krank", text: `${who} ist krank und bleibt morgen zu Hause.` },
      { label: "Abholung durch andere Person", text: `${who} wird heute von einer anderen Person abgeholt.` },
      { label: "Ich habe eine Frage", text: "Darf mein Kind sein eigenes Mittagessen mitbringen?" },
    ];
  }
  const who = name || "My child";
  return [
    { label: "My child will be late", text: `${who} will be late tomorrow, we have a doctor appointment.` },
    { label: "My child is sick", text: `${who} is sick and will stay at home tomorrow.` },
    { label: "Pick-up by another person", text: `${who} will be picked up today by another person.` },
    { label: "I have a question", text: "Can my child bring their own lunch?" },
  ];
}

// ----- dates -----
const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-GB");

/** "2026-11-04" -> Date at local midnight (avoids the UTC shift of new Date("2026-11-04")). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const fmt = (d: Date, lang: Lang, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale(lang), options).format(d);

export const formatDay = (iso: string, lang: Lang) =>
  fmt(parseIso(iso), lang, { weekday: "short", day: "numeric", month: "short" });

export const formatLong = (d: Date, lang: Lang) =>
  fmt(d, lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const formatShortDate = (isoDateTime: string, lang: Lang) =>
  fmt(new Date(isoDateTime), lang, { day: "numeric", month: "short" });

/** The seven days the week board covers, e.g. "Mon 2 – Sun 8 Nov". */
export function formatRange(startIso: string, lang: Lang): string {
  const start = parseIso(startIso);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const part = (d: Date, withMonth: boolean) =>
    fmt(d, lang, withMonth ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric" });
  return `${part(start, start.getMonth() !== end.getMonth())} – ${part(end, true)}`;
}

export function iconFor(type: ItemType, title: string): string {
  if (type === "deadline") return "⚠️";
  if (type === "closure") return "📅";
  if (type === "reminder") return "🧥";
  return /laterne|lantern/i.test(title) ? "🏮" : "🎉";
}

export function errorText(err: unknown, lang: Lang): string {
  const de = lang === "de";
  const code = err instanceof ApiError ? err.code : "unknown";
  if (code === "network")
    return de
      ? "Der Server ist nicht erreichbar. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
      : "We can't reach the server. Please check your connection and try again.";
  if (code === "unauthorized") return de ? "Bitte melden Sie sich erneut an." : "Please log in again.";
  if (code === "invalid_request")
    return de ? "Bitte prüfen Sie Ihre Eingabe und versuchen Sie es erneut." : "Please check what you entered and try again.";
  return de
    ? "Etwas ist schiefgelaufen. Bitte versuchen Sie es gleich noch einmal."
    : "Something went wrong, please try again in a moment.";
}
