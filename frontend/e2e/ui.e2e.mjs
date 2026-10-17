// End-to-end test: drives the real UI in Chrome against the real backend (started in mock mode).
//
//   scripts/e2e.ps1            starts everything on throw-away data, runs this file, cleans up
//   pnpm e2e                   runs this file against servers you started yourself
//
// Needs Google Chrome (or Edge) installed. Env: UI_URL (default http://localhost:8443),
// API_URL (default http://localhost:8000), SHOTS (folder for screenshots).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const UI = process.env.UI_URL ?? "http://localhost:8443";
const API = process.env.API_URL ?? "http://localhost:8000";
const SHOTS = process.env.SHOTS ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "en-GB" });
const page = await context.newPage();
page.setDefaultTimeout(8000);

const problems = [];
let expectNoise = false; // set while a request is blocked on purpose
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !expectNoise) problems.push(`console error: ${m.text()}`);
});
page.on("dialog", (d) => d.accept()); // the delete confirmation

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    const file = `${SHOTS}/FAIL-${name.replace(/\W+/g, "-").slice(0, 50)}.png`;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    console.log(`  FAIL  ${name}\n        ${String(e.message).replace(/\s+/g, " ").slice(0, 400)}\n        screenshot: ${file}`);
  }
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const text = (selector) => page.locator(selector).allInnerTexts();
const click = (name) => page.getByRole("button", { name }).first().click();

async function launch() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error("Neither Google Chrome nor Microsoft Edge could be started.");
}

console.log(`UI ${UI}  |  API ${API}\n`);
console.log("Parent journey");

await step("welcome screen loads", async () => {
  await page.goto(UI);
  await page.getByRole("heading", { name: /Every parent belongs/ }).waitFor();
  await shot("01-welcome");
});

await step("onboarding: language list comes from the backend (English + Deutsch only)", async () => {
  await page.locator(".choice-card").first().click();
  await page.locator(".language-grid button").first().waitFor();
  assert.deepEqual((await text(".language-grid button")).map((t) => t.replace(/[✓\s]+$/, "").trim()), ["English", "Deutsch"]);
});

await step("onboarding: choosing Deutsch switches the UI to German, then back to English", async () => {
  await page.locator(".language-grid button", { hasText: "Deutsch" }).click();
  await page.getByRole("heading", { name: "Willkommen" }).waitFor();
  await page.locator(".language-grid button", { hasText: "English" }).click();
  await page.getByRole("heading", { name: "Welcome" }).waitFor();
});

await step("onboarding: child's name is required", async () => {
  assert.equal(await page.getByRole("button", { name: /Continue/ }).isDisabled(), true);
});

await step("onboarding: fill in and continue to the home screen", async () => {
  const inputs = page.locator(".setup-card input");
  await inputs.nth(0).fill("Amira");
  await inputs.nth(1).fill("Yusuf");
  await inputs.nth(2).fill("2023-06-14");
  await shot("02-onboarding");
  await click(/Continue/);
  await page.getByRole("heading", { name: /Hello Amira/ }).waitFor();
});

await step("home: greeting uses the names and the real date from the server", async () => {
  assert.match(await page.locator(".greeting p").innerText(), /Yusuf's Kita/);
  assert.match(await page.locator(".greeting .date").innerText(), /9 november 2026/i); // DEMO_TODAY from the backend (the CSS shows it in capitals)
});

await step("home: week board shows the real announcements from the database", async () => {
  await page.locator(".week .event-card").first().waitFor();
  const titles = await text(".week .event-card h3");
  for (const expected of ["Sign the trip permission slip", "Lantern walk (Laternenfest)", "Kita closed (staff training)"]) {
    assert.ok(titles.some((t) => t.includes(expected)), `missing "${expected}" in ${JSON.stringify(titles)}`);
  }
  assert.match(await page.locator(".week .eyebrow").innerText(), /mon 9/i);
  await shot("03-home-en");
});

await step("home: the deadline card says what to do, the event card says what to bring", async () => {
  const cards = await text(".week .event-card");
  assert.ok(cards.some((c) => c.includes("What to do:") && c.includes("Sign the paper")));
  assert.ok(cards.some((c) => c.includes("Bring:") && c.includes("a homemade lantern")));
});

await step("home: an API failure shows a friendly error with Retry, and Retry recovers", async () => {
  expectNoise = true;
  await page.route("**/api/v1/week**", (route) => route.abort());
  await page.locator(".language").click(); // switching language reloads the week
  await page.locator(".week .state-card.error").waitFor();
  assert.match(await page.locator(".week .state-card.error").innerText(), /Etwas ist schiefgelaufen|can't reach the server/i);
  await shot("04-week-error");
  await page.unroute("**/api/v1/week**");
  expectNoise = false;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await page.locator(".week .event-card").first().waitFor();
});

await step("language switch: the whole screen and the announcements change to German", async () => {
  assert.match(await page.locator(".greeting h1").innerText(), /Hallo Amira/);
  const titles = await text(".week .event-card h3");
  assert.ok(titles.includes("Laternenfest"), JSON.stringify(titles));
  assert.ok(titles.some((t) => t.startsWith("Ausflug")));
  await shot("05-home-de");
  await page.locator(".language").click(); // back to English
  await page.getByRole("heading", { name: /Hello Amira/ }).waitFor();
});

await step("ask: a question gets an answer with source, what to do and a cultural note", async () => {
  await page.locator(".chat-panel .chat-input input").fill("My son has a fever, can he go tomorrow?");
  await page.locator(".chat-panel .chat-input .btn").click();
  await page.locator(".answer-card").waitFor();
  const card = await page.locator(".answer-card").innerText();
  assert.match(card, /24 hours/);
  assert.match(card, /house-rules\.md/);
  assert.match(card, /What to do/);
  await shot("06-answer");
});

await step("ask: 👍 is acknowledged", async () => {
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await page.getByText("Thanks for your feedback").waitFor();
});

await step("ask: a question the documents don't cover says so and offers to write to the Kita", async () => {
  await page.locator(".focused-chat .chat-input input").fill("Can my son bring his own lunch?");
  await page.locator(".focused-chat .chat-input .btn").click();
  await page.locator(".unknown-card").waitFor();
  assert.match(await page.locator(".unknown-card").innerText(), /not in the Kita's documents/);
  await shot("07-not-in-documents");
});

await step("write to the Kita: opens with the question, creates polite German + translation", async () => {
  await page.getByRole("button", { name: /Write this question to the Kita/ }).click();
  const textarea = page.locator(".composer textarea");
  assert.equal(await textarea.inputValue(), "Can my son bring his own lunch?");
  await shot("08-composer");
  await click(/Create message in German/);
  await page.locator(".german-card p").waitFor();
  assert.match(await page.locator(".german-card p").innerText(), /Guten Morgen/);
  assert.ok((await page.locator(".translation p").innerText()).length > 10);
  await shot("09-result");
});

await step("write to the Kita: copy button copies and confirms", async () => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: UI }).catch(() => {});
  await click(/Copy message/);
  await page.locator(".toast").waitFor();
});

await step("write to the Kita: a template chip uses the child's name", async () => {
  await click("Start again");
  await page.locator(".composer .chip", { hasText: "My child is sick" }).click();
  assert.match(await page.locator(".composer textarea").inputValue(), /^Yusuf is sick/);
  await page.locator(".composer .icon-btn").click(); // close
});

await step("settings: save a new first name and see it on the home screen", async () => {
  await page.getByRole("button", { name: "Settings" }).click();
  const inputs = page.locator(".settings-card input");
  await inputs.nth(0).fill("Amira K");
  await click("Save changes");
  await page.getByText("Saved.").waitFor();
  await click("← Back");
  await page.getByRole("heading", { name: /Hello Amira K/ }).waitFor();
});

await step("persistence: after a reload the profile is remembered (no onboarding again)", async () => {
  await page.reload();
  await page.locator(".choice-card").first().click();
  await page.getByRole("heading", { name: /Hello Amira K/ }).waitFor();
});

await step("privacy: the birthday never leaves the browser", async () => {
  const profile = await page.evaluate(() => localStorage.getItem("kita.profile"));
  assert.match(profile, /2023-06-14/); // stored locally...
  // ...but nothing sent to the backend contains it (checked on a fresh ask)
  const sent = [];
  page.on("request", (r) => r.url().includes("/api/") && sent.push(`${r.url()} ${r.postData() ?? ""}`));
  await page.locator(".chat-panel .chat-input input").fill("What is Eingewöhnung?");
  await page.locator(".chat-panel .chat-input .btn").click();
  await page.locator(".conversation, .answer-card, .unknown-card").first().waitFor();
  await page.waitForTimeout(500);
  assert.ok(sent.length > 0);
  assert.ok(!sent.some((s) => s.includes("2023-06-14")), "the birthday was sent to the server");
});

console.log("\nStaff journey");

await step("staff login: a wrong code is rejected with a German message", async () => {
  expectNoise = true; // the browser logs the expected 401 as a console error
  await page.goto(UI);
  await page.locator(".staff-card").click();
  await page.locator(".login-card input").fill("WRONG");
  await click(/Anmelden/);
  await page.getByText("Kita-Code nicht gefunden").waitFor();
  expectNoise = false;
  await shot("10-login-error");
});

await step("staff login: the right code opens the dashboard with the real announcements", async () => {
  await page.locator(".login-card input").fill("SONNE");
  await click(/Anmelden/);
  await page.getByRole("heading", { name: /Guten Morgen/ }).waitFor();
  await page.locator(".announcement-list article").first().waitFor();
  assert.equal((await text(".announcement-list article h3")).filter((t) => !t.startsWith("✓")).length >= 4, true);
  await shot("11-dashboard");
});

await step("dashboard: the family counter is a real number from the question log", async () => {
  await page.locator(".mini-stat").waitFor();
  assert.match(await page.locator(".mini-stat").innerText(), /\d+ Famil/);
});

await step("publish: an incomplete form is rejected before anything is sent", async () => {
  await click(/Veröffentlichen/);
  await page.getByText("Bitte geben Sie einen Titel ein.").waitFor();
});

await step("publish: preview shows the English and German versions", async () => {
  await page.locator(".form-grid label.wide input").first().fill("Sommerfest");
  await page.locator(".form-card textarea").fill("Am Freitag feiern wir unser Sommerfest. Bitte bringen Sie Kuchen mit.");
  await page.locator('input[aria-label="Datum"]').fill("2026-11-12");
  await page.locator('input[aria-label="Uhrzeit"]').fill("16:00");
  await page.locator(".form-grid label", { hasText: "Bitte mitbringen" }).locator("input").fill("Kuchen");
  await click(/Vorschau für Eltern/);
  await page.locator(".preview-modal").waitFor();
  assert.deepEqual(await text(".preview-modal .tabs button"), ["Englisch", "Deutsch"]);
  assert.match(await page.locator(".preview-canvas").innerText(), /Sommerfest/);
  await shot("12-preview");
});

await step("publish: publishing from the preview shows the success banner and lists it as new", async () => {
  await click(/Veröffentlichen/);
  await page.getByText(/Veröffentlicht! Eltern sehen/).waitFor();
  const row = page.locator(".announcement-list article", { hasText: "Sommerfest" });
  await row.waitFor();
  assert.match(await row.innerText(), /neu/i); // tags are shown in capitals
  await shot("13-published");
});

await step("parent view: the new announcement is on the parents' week board right away", async () => {
  await page.getByText("Elternansicht öffnen").click();
  await page.locator(".week .event-card", { hasText: "Sommerfest" }).waitFor();
  assert.match(await page.locator(".week .event-card", { hasText: "Sommerfest" }).innerText(), /new/i);
});

await step("edit: the form is filled from the announcement and saving updates the list", async () => {
  await page.goto(UI);
  await page.locator(".staff-card").click();
  await click(/Anmelden/);
  const row = page.locator(".announcement-list article", { hasText: "Sommerfest" });
  await row.getByRole("button", { name: "Bearbeiten" }).click();
  assert.equal(await page.locator(".form-grid label.wide input").first().inputValue(), "Sommerfest");
  await page.locator(".form-grid label.wide input").first().fill("Herbstfest");
  await click(/Speichern/);
  await page.locator(".announcement-list article", { hasText: "Herbstfest" }).waitFor();
});

await step("delete: confirming removes the announcement", async () => {
  const row = page.locator(".announcement-list article", { hasText: "Herbstfest" });
  await row.getByRole("button", { name: "Löschen" }).click();
  await page.locator(".announcement-list article", { hasText: "Herbstfest" }).waitFor({ state: "detached" });
});

await step("documents: the knowledge base lists the real files", async () => {
  await page.locator(".sidebar nav button", { hasText: "Dokumente" }).click();
  await page.locator(".document-card").first().waitFor();
  const names = await text(".document-card p");
  assert.ok(names.some((n) => n.includes("house-rules.md")), JSON.stringify(names));
  assert.ok(names.some((n) => n.includes("letters/laternenfest.md")));
  await shot("14-documents");
});

await step("documents: editing and saving writes the file on the server", async () => {
  await page.locator(".document-card", { hasText: "house-rules.md" }).getByRole("button", { name: "Bearbeiten" }).click();
  const area = page.locator(".editor-card textarea");
  await page.waitForFunction(() => document.querySelector(".editor-card textarea")?.value.includes("Krankheit"));
  await area.fill((await area.inputValue()) + "\n\n## §6 E2E-Test\nDieser Abschnitt stammt aus dem UI-Test.");
  await click("Speichern");
  await page.getByText("Gespeichert. Die App nutzt ab jetzt die neue Version.").waitFor();
  await shot("15-editor-saved");
  const token = (await (await fetch(`${API}/api/v1/staff/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "SONNE" }) })).json()).token;
  const doc = await (await fetch(`${API}/api/v1/staff/documents/house-rules.md`, { headers: { authorization: `Bearer ${token}` } })).json();
  assert.match(doc.content, /E2E-Test/);
});

await step("insights: the parents overview shows real questions, incl. the unanswered one", async () => {
  await page.locator(".sidebar nav button", { hasText: "Eltern" }).click();
  await page.locator(".stat-grid").waitFor();
  const stats = await text(".stat-grid article b");
  assert.ok(Number(stats[0]) >= 1 && Number(stats[2]) >= 3, JSON.stringify(stats));
  assert.match(await page.locator(".unanswered").innerText(), /own lunch/);
  await shot("16-insights");
});

await step("staff area is protected: without a login the dashboard is not reachable", async () => {
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator(".staff-card").click();
  // the login screen must come up and must not auto-login
  await page.locator(".login-card").waitFor();
});

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (problems.length) {
  console.log(`\nBrowser problems (${problems.length}):`);
  for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
}
process.exit(failed || problems.length ? 1 : 0);
