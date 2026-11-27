// Makes the Google Play phone screenshots (1080 x 1920) and the feature graphic (1024 x 500)
// from the real free app in android-app/www. Needs Playwright with Chromium:
//   npm i --no-save playwright && npx playwright install chromium && node tools/store-images.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "store", "screenshots");
mkdirSync(out, { recursive: true });
const appUrl = pathToFileURL(join(root, "www", "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.addInitScript(() => {
  if (!localStorage.getItem("wishbook-v1")) localStorage.setItem("wishbook-v1", JSON.stringify({ ageOk: true, view: "start" }));
});
await page.goto(appUrl);
await page.waitForTimeout(800);
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: join(out, name) }); };

await page.fill("#qName", "Sam").catch(() => {});
await shot("1-quiz.png");
for (let i = 0; i < 25; i++) {
  if (await page.$("#qGo")) {
    await page.fill("#qNotes", "Builds drones, plays trombone");
    await page.click("#qGo");
    break;
  }
  if (i === 2) await shot("2-taste.png");
  await page.click('#qbody [data-who="me"], #qbody [data-k="0"], #qbody [data-next], #qbody [data-style], #qbody [data-b]');
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1500);
await shot("3-ideas.png");
for (let i = 0; i < 6; i++) {
  const b = await page.$('#ideaGrid [data-a="keep"][aria-pressed="false"]');
  if (b) { await b.click(); await page.waitForTimeout(120); }
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot("4-circled.png");
await page.click('.tabs [data-v="rank"]');
await shot("5-rank.png");
await page.click('.tabs [data-v="share"]');
await page.fill("#listName", "Sam's wishlist");
await page.dispatchEvent("#listName", "input");
await shot("6-share.png");
await page.click('.tabs [data-v="group"]');
await page.fill("#gName", "Robotics team");
for (const n of ["Ava", "Ben", "Cam", "Dev", "Eli", "Fin"]) { await page.fill("#gAdd", n); await page.click("#gAddBtn"); }
await page.click("#gDraw");
await shot("7-group.png");

// Feature graphic
const logo = "data:image/png;base64," + readFileSync(join(root, "www", "icons", "icon-maskable-512.png")).toString("base64");
const fonts = readFileSync(join(root, "www", "fonts", "fonts.css"), "utf8").replace(/url\(([^)]+)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(join(root, "www", "fonts", f)).toString("base64")})`);
const fg = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await fg.setContent(`<style>${fonts}
body{margin:0;width:1024px;height:500px;background:radial-gradient(circle at 28% 55%,#4a4470 0,#23284d 55%);display:flex;align-items:center;gap:40px;padding:0 70px;box-sizing:border-box;font-family:Nunito,sans-serif;color:#fff}
img{width:360px;height:360px;border-radius:44px}
h1{font-size:96px;font-weight:900;margin:0;line-height:1}
p{font-family:Caveat,cursive;font-size:54px;color:#ffd77a;margin:14px 0 0}
small{display:block;font-size:26px;font-weight:700;color:#dfe3ff;margin-top:18px}
</style><img src="${logo}"><div><h1>Wishwell</h1><p>Want it, list it, get it.</p><small>A free wishlist maker for gift season</small></div>`);
await fg.waitForTimeout(500);
await fg.screenshot({ path: join(root, "store", "feature-graphic-1024x500.png") });
await browser.close();
console.log("Store images written to android-app/store");
