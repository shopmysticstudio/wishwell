// Builds the free Play Store version of Wishwell from the web app in ../app.
// The free app has starter ideas only: no AI, no prices for passes, no links to buy anything
// from Wishwell, no service worker and no Google Fonts requests (fonts are bundled).
// Every change below must match the web app exactly. If the web app changes and a match is
// lost, this script stops with an error instead of shipping a half-changed app.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = join(root, "..", "app");
const out = join(root, "www");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Only img/ is needed. The icons/ folder and manifest are for the website's home-screen install;
// the Play app has its own launcher icons, so they'd only add about 400 KB.
cpSync(join(src, "img"), join(out, "img"), { recursive: true });

let html = readFileSync(join(src, "index.html"), "utf8");
const swap = (from, to, label) => {
  if (!html.includes(from)) throw new Error(`Free app build: could not find "${label}" in app/index.html. Update make-free-web.mjs.`);
  html = html.split(from).join(to);
};
const swapRe = (re, to, label) => {
  if (!re.test(html)) throw new Error(`Free app build: could not find "${label}" in app/index.html. Update make-free-web.mjs.`);
  html = html.replace(re, to);
};

// Website install links: the free app doesn't ship the manifest or web icons (the manifest link was a missing file).
swapRe(/<link rel="manifest" href="manifest\.webmanifest">\s*<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>\s*/, "", "web app manifest and icon links");

// Settings: AI is always off in the free app.
swap('<script src="config.js"></script>', '<script>window.WISHWELL_CONFIG={aiUrl:"",shareBase:"https://shopmysticstudio.github.io/wishwell/app/",shortLinks:true};</script>', "config.js script tag");
swap("if(CFG.aiUrl){", "if(false){", "AI switch");

// Details box: say plainly that short hobby words work best, since there's no AI to read sentences.
swap("<p class=\"qsub\">Optional. Hobbies, favorite things, what ${S.forWho===\"me\"?\"you\":\"they\"} already have.</p>", "<p class=\"qsub\">Optional. A few hobby words help most, like puzzles, camping, baking or cats.</p>", "Details hint");
swap('placeholder="Bakes on weekends, plays soccer, already has a good speaker"', 'placeholder="baking, soccer, coffee, movie nights"', "Details placeholder");

// Bundled fonts instead of Google Fonts.
swapRe(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link href="https:\/\/fonts\.googleapis\.com[^"]*" rel="stylesheet">/, '<link rel="stylesheet" href="fonts/fonts.css">', "Google Fonts links");

// Header: no Plans button (kept hidden so the script still finds it), no "Test draft" tag.
swap('<button class="plans" id="openPlans" type="button">Plans</button>', '<button class="plans" id="openPlans" type="button" hidden>Plans</button>', "Plans button");
swap('<div class="sub">Test draft by Wishwell</div>', "", "Test draft tag");

// AI status line.
swap('<p class="small muted" id="aiState">Checking for AI ideas...</p>', '<p class="small muted" id="aiState" hidden></p>', "AI status line");
swap('aiLine.textContent=sample?"AI ideas are on.":"Using starter ideas. AI ideas coming soon."', 'aiLine.textContent=""', "AI status text");

// Plans and prices for passes: gone. A tiny stand-in keeps the ids the script uses.
swapRe(/<div class="modal" id="plans"[\s\S]*?(?=<div class="modal" id="copyM")/,
  '<div class="modal" id="plans" hidden role="dialog" aria-modal="true"><div class="box"><p id="plansWhy"></p><p id="payNote"></p><button class="btn" type="button" id="closePlans">Close</button></div></div>\n',
  "Plans window");
swapRe(/if\(S\.aiRounds===3\)setTimeout\(\(\)=>openPlans\([\s\S]*?\),900\);/, "", "AI rounds prompt");
swap("function openPlans(why,tier){", "function openPlans(why,tier){return;", "openPlans");
swap('if(p.length>4&&!S.g.unlocked){S.g.unlocked=true;save();openPlans(`Groups of 5 or more will use the $2.99 Exchange Pass, coming soon. For now it\'s free, so close this to draw names for ${p.length} people.`,"exchange");return}', "", "Exchange Pass prompt");
swap("Free for up to 4 people. Groups of 5 or more will use the $2.99 Exchange Pass, coming soon. For now, any size group is free.", "Any size group is free.", "Exchange Pass note");
swap(',\n  `Would pay: Holiday Pass ${y(m.pay.holiday)}, Exchange Pass ${y(m.pay.exchange)}, Plus ${y(m.pay.plus)}`].join("\\n");', '].join("\\n");', "Would pay report line");

// Buy links are plain store searches, so no "Paid link" label.
swap('Buy<span class="pl">Paid link</span></a>', "Buy</a>", "Paid link label");
swap('rel="noopener sponsored"', 'rel="noopener"', "sponsored rel");

// Footer.
swapRe(/<footer>[\s\S]*?<\/footer>/, "<footer>Free app. No accounts. Your lists stay on this phone. Prices are rough estimates, not live prices. Buy, Compare prices and Magic Coupons open a store or deals search in your browser.</footer>", "footer");

// No service worker inside the app: the files already live on the phone.
swap('if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});', "", "service worker");

// Final checks: nothing about paying Wishwell, passes or AI may be left on screen.
for (const bad of ["Holiday Pass", "Exchange Pass", "$4.99", "$2.99", "$19.99", "$34.99", "fonts.googleapis.com", "Plans (coming soon)", "AI ideas coming soon"]) {
  if (html.includes(bad)) throw new Error(`Free app build: "${bad}" is still in the page.`);
}
writeFileSync(join(out, "index.html"), html);

// Fonts (SIL Open Font License), copied from the @fontsource packages.
const fontDir = join(out, "fonts");
mkdirSync(fontDir, { recursive: true });
const faces = [["nunito", 500], ["nunito", 700], ["nunito", 800], ["nunito", 900], ["caveat", 700]];
let css = "";
for (const [fam, w] of faces) {
  const file = `${fam}-latin-${w}-normal.woff2`;
  const from = join(root, "node_modules", "@fontsource", fam, "files", file);
  if (!existsSync(from)) throw new Error(`Font missing: ${from}. Run npm install in android-app first.`);
  copyFileSync(from, join(fontDir, file));
  const name = fam === "nunito" ? "Nunito" : "Caveat";
  css += `@font-face{font-family:${name};font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format("woff2")}\n`;
}
writeFileSync(join(fontDir, "fonts.css"), css);
console.log("Free app web files written to android-app/www");
