// Smoke test of the UI with REAL Claude answers (uses a few cents of API credit).
//   scripts/e2e.ps1 -Live
// The backend must run with MOCK_AI=false and a working key in backend/.env.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const UI = process.env.UI_URL ?? "http://localhost:8443";
const SHOTS = process.env.SHOTS ?? "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

let browser;
for (const channel of ["chrome", "msedge"]) {
  try {
    browser = await chromium.launch({ channel, headless: true });
    break;
  } catch {
    /* next */
  }
}
if (!browser) throw new Error("Neither Google Chrome nor Microsoft Edge could be started.");
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "en-GB" })).newPage();
page.setDefaultTimeout(90000); // real answers take a few seconds

let passed = 0;
let failed = 0;
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console error: ${m.text()}`));
page.on("dialog", (d) => d.accept());

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    const file = `${SHOTS}/LIVE-FAIL-${name.replace(/\W+/g, "-").slice(0, 40)}.png`;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    console.log(`  FAIL  ${name}\n        ${String(e.message).replace(/\s+/g, " ").slice(0, 500)}\n        screenshot: ${file}`);
  }
}
const click = (name) => page.getByRole("button", { name }).first().click();

console.log(`UI ${UI}  (real Claude)\n`);

await step("onboarding and home", async () => {
  await page.goto(UI);
  await page.locator(".choice-card").first().click();
  const inputs = page.locator(".setup-card input");
  await inputs.nth(0).fill("Amira");
  await inputs.nth(1).fill("Yusuf");
  await click(/Continue/);
  await page.locator(".week .event-card").first().waitFor();
});

await step("ask (English): fever question is answered from the house rules", async () => {
  await page.locator(".chat-panel .chat-input input").fill("My son had a fever last night. Can he go to the Kita tomorrow?");
  await page.locator(".chat-panel .chat-input .btn").click();
  await page.locator(".skeleton-card").first().waitFor();
  await page.locator(".answer-card").waitFor();
  const card = await page.locator(".answer-card").innerText();
  assert.match(card, /24/);
  assert.match(card, /house-rules\.md/);
  await page.screenshot({ path: `${SHOTS}/live-1-answer.png`, fullPage: true });
});

await step("ask: something the documents don't say is not invented", async () => {
  await page.locator(".focused-chat .chat-input input").fill("Is there a photographer day this year?");
  await page.locator(".focused-chat .chat-input .btn").click();
  await page.locator(".unknown-card").waitFor();
  await page.screenshot({ path: `${SHOTS}/live-2-unknown.png`, fullPage: true });
});

await step("write to the Kita: polite German, signed with the parent's name", async () => {
  await page.getByRole("button", { name: /Write this question to the Kita/ }).click();
  await page.locator(".composer textarea").fill("Yusuf will be late tomorrow, he has a doctor appointment.");
  await click(/Create message in German/);
  await page.locator(".german-card p").waitFor();
  const german = await page.locator(".german-card p").innerText();
  assert.match(german, /Yusuf/);
  assert.match(german, /Amira/);
  assert.match(german, /Gr[üu](ß|ss)e/);
  assert.ok((await page.locator(".translation p").innerText()).includes("Yusuf"));
  await page.screenshot({ path: `${SHOTS}/live-3-message.png`, fullPage: true });
  await page.locator(".composer .icon-btn").click();
});

await step("ask (German UI): the answer comes back in German", async () => {
  await page.locator(".language").click(); // English -> Deutsch
  await page.getByRole("heading", { name: /Hallo Amira/ }).waitFor();
  await page.locator(".chat-panel .chat-input input").fill("Was muss ich zum Laternenfest mitbringen?");
  await page.locator(".chat-panel .chat-input .btn").click();
  await page.locator(".skeleton-card").first().waitFor(); // the new question is loading
  await page.locator(".skeleton-card").waitFor({ state: "detached" });
  const card = await page.locator(".answer-card").last().innerText(); // the screen lists the whole conversation: take the newest
  assert.match(card, /Laterne/);
  assert.match(card, /Antwort/); // the labels are German too
  await page.screenshot({ path: `${SHOTS}/live-4-german.png`, fullPage: true });
});

await step("staff publishes a German announcement; parents read a real English translation", async () => {
  await page.goto(UI);
  await page.locator(".staff-card").click();
  await click(/Anmelden/);
  await page.locator(".form-grid label.wide input").first().fill("Sommerfest im Garten");
  await page.locator(".form-card textarea").fill("Am Freitag um 16 Uhr feiern wir unser Sommerfest im Garten. Bitte bringen Sie einen Kuchen oder Obst für das Buffet mit. Alle Familien sind herzlich eingeladen!");
  await page.locator('input[aria-label="Datum"]').fill("2026-11-05");
  await page.locator('input[aria-label="Uhrzeit"]').fill("16:00");
  await page.locator(".form-grid label", { hasText: "Bitte mitbringen" }).locator("input").fill("Kuchen oder Obst");
  await click(/Veröffentlichen/);
  await page.getByText(/Veröffentlicht! Eltern sehen/).waitFor();
  await page.screenshot({ path: `${SHOTS}/live-5-published.png`, fullPage: true });
  await page.getByText("Elternansicht öffnen").click();
  const card = page.locator(".week .event-card", { hasText: /summer|Sommerfest/i }).first();
  await card.waitFor();
  const title = await card.locator("h3").innerText();
  assert.ok(!title.startsWith("["), `still a mock translation: ${title}`);
  // the page is in German here (profile language), so check the English version through the API too
  const en = await (await fetch(`${UI}/api/v1/week?lang=en&today=2026-11-02`)).json();
  const item = en.items.find((i) => /Sommerfest/i.test(i.title));
  assert.ok(item && /party|festival/i.test(item.title), `English title: ${item?.title}`);
  await page.screenshot({ path: `${SHOTS}/live-6-parent-sees-it.png`, fullPage: true });
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (problems.length) {
  console.log(`\nBrowser problems (${problems.length}):`);
  for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
}
process.exit(failed || problems.length ? 1 : 0);
