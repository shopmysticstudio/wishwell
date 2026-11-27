import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = pathToFileURL(join(root, "www", "index.html")).href;
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, colorScheme: scheme });
  await page.addInitScript(() => { localStorage.setItem("wishbook-v1", JSON.stringify({ ageOk: true, view: "ideas", forWho: "me", quiz: { mind: 1, treat: 1 }, ints: ["Books", "Room setup"], notes: "quirky fun gifts to keep my brain busy" })); });
  await page.goto(appUrl); await page.waitForTimeout(600);
  await page.evaluate(() => { finishQuiz(); });
  await page.waitForTimeout(600);
  const keeps = await page.$$('#ideaGrid [data-a="keep"]');
  await keeps[0].click(); await page.waitForTimeout(700);
  await (await page.$$('#ideaGrid .card h3'))[2].click(); await page.waitForTimeout(700);
  await (await page.$$('#ideaGrid [data-a="cut"]'))[1].click(); await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 120)); await page.waitForTimeout(300);
  const f = join(root, `prev-${scheme}.jpg`);
  await page.screenshot({ path: f, type: "jpeg", quality: 70 });
  console.log(`BEGIN-${scheme}`); const b = readFileSync(f).toString("base64");
  for (let i = 0; i < b.length; i += 4000) console.log("B64:" + b.slice(i, i + 4000));
  console.log(`END-${scheme}`);
}
await browser.close();
