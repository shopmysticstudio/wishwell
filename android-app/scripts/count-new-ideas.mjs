// Counts the starter ideas that are new since the last Play release, and checks the idea list.
// Leo's rule: every app update adds at least 50 new ideas, spread across broad categories.
//   node scripts/count-new-ideas.mjs                 report (warns if the rule isn't met)
//   node scripts/count-new-ideas.mjs --strict        same, but exits with an error if it isn't met
//   node scripts/count-new-ideas.mjs --mark-released 4   after uploading version 4, save this list as the new baseline
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const MIN_NEW = 50, MIN_CATEGORIES = 8;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "..", "app", "index.html"), "utf8");
const m = html.match(/const BANK=(\[[\s\S]*?\n\]);/);
if (!m) throw new Error("BANK not found in app/index.html");
const BANK = new Function("return " + m[1])();
const basePath = join(root, "release", "released-ideas.json");
const base = JSON.parse(readFileSync(basePath, "utf8"));
const key = t => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const old = new Set(base.titles.map(key));

const problems = [];
const seen = new Map();
for (const b of BANK) {
  const [title, cat, lo, hi] = b;
  if (seen.has(key(title))) problems.push(`duplicate title: ${title}`);
  seen.set(key(title), 1);
  if (!(lo >= 1 && hi <= 1000 && lo <= hi)) problems.push(`price out of range: ${title} (${lo} to ${hi})`);
  if (title.length < 3 || title.length > 50) problems.push(`title length: ${title}`);
  if (b.length !== 6) problems.push(`wrong number of fields: ${title}`);
}

const fresh = BANK.filter(b => !old.has(key(b[0])));
const byCat = {};
fresh.forEach(b => (byCat[b[1]] = (byCat[b[1]] || 0) + 1));
const cats = Object.keys(byCat).length;
console.log(`Starter ideas: ${BANK.length}. New since version ${base.versionCode}: ${fresh.length} in ${cats} categories.`);
console.log("  " + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", "));
problems.forEach(p => console.log("Problem: " + p));

const ruleMet = fresh.length >= MIN_NEW && cats >= MIN_CATEGORIES;
if (!ruleMet) {
  const msg = `Release rule not met yet: needs at least ${MIN_NEW} new ideas in at least ${MIN_CATEGORIES} categories (has ${fresh.length} in ${cats}).`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : msg);
}

const i = process.argv.indexOf("--mark-released");
if (i > 0) {
  const versionCode = +process.argv[i + 1];
  if (!versionCode) throw new Error("Give the version code you uploaded, like --mark-released 4");
  const commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  writeFileSync(basePath, JSON.stringify({ versionCode, commit, titles: BANK.map(b => b[0]) }, null, 1) + "\n");
  console.log(`Saved ${BANK.length} ideas as the version ${versionCode} baseline. Commit release/released-ideas.json.`);
}
if (problems.length || (process.argv.includes("--strict") && !ruleMet)) process.exit(1);
