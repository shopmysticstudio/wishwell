// Test crowd hints (what other people kept and cut steer a round), the generic-kind filter and daily pick totals.
// Run: node server/ai-ideas/test/crowd.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
for (const f of ["0001_idea_pool.sql", "0002_have.sql", "0006_pick_stats.sql"]) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt,
  async batch(sts) { sql.exec("BEGIN"); try { for (const st of sts) await st.run(); sql.exec("COMMIT") } catch (e) { sql.exec("ROLLBACK"); throw e } } };
const { genericKind, ideaKey } = worker._test;

// Seed the pool: a mug that everyone cuts, a telescope people keep under Space.
const seed = (title, shown, kept, top, cut, tag) => {
  const k = ideaKey(title);
  sql.prepare("INSERT INTO ideas (key, title, category, shown, kept, top, cut, have, first_day, last_day) VALUES (?,?,?,?,?,?,?,?,?,?)").run(k, title, "Other", shown, kept, top, cut, 0, "2026-11-01", "2026-11-20");
  if (tag) sql.prepare("INSERT INTO idea_tags (key, tag, n) VALUES (?,?,?)").run(k, tag, 3);
};
seed("Custom photo mug", 6, 0, 0, 5);
seed("Phone case", 3, 1, 0, 2);
seed("Beginner telescope", 5, 3, 1, 0, "int:Space");

let prompt = "";
const AI = { async run(m, input) { prompt = input.messages.map(x => x.content).join("\n"); return { response: JSON.stringify([
  { title: "Custom photo mug", category: "Room", lo: 15, hi: 25, why: "x", search: "mug" },
  { title: "Pottery class", category: "Making", lo: 40, hi: 60, why: "x", search: "pottery class" },
  { title: "Moon phase desk lamp", category: "Room", lo: 20, hi: 40, why: "Space fan", search: "moon lamp" },
  { title: "Star map poster", category: "Room", lo: 15, hi: 30, why: "Space fan", search: "star map" }]) }; } };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const waits = [];
const env = { AI, KV, DB, BETA_ONLY: "false", BACKUP_MODEL: "off", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const ctx = { waitUntil: p => waits.push(p) };
const req = (path, body) => new Request("https://w.example" + path, { method: "POST", headers: { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": "crowdtest00000000001", "CF-Connecting-IP": "8.8.4.4" }, body: JSON.stringify(body) });

assert.equal(genericKind("Pottery class"), "class");
assert.equal(genericKind("Swim lessons"), "lesson");
assert.equal(genericKind("Classic car model"), "");

let r = await worker.fetch(req("/", { n: 4, forWho: "them", ints: ["Space"], budget: "75", notes: "" }), env, ctx);
await Promise.all(waits.splice(0));
const titles = (await r.json()).map(i => i.title);
assert.equal(r.status, 200);
assert.match(prompt, /kept ideas like: Beginner telescope/);
assert.match(prompt, /often cut these.*Custom photo mug/);
assert.ok(!titles.includes("Custom photo mug"), "blocked by the crowd");
assert.ok(!titles.includes("Pottery class"), "generic class dropped");
assert.ok(titles.includes("Moon phase desk lamp"));

// A class stays when the details ask for one.
r = await worker.fetch(req("/", { n: 4, forWho: "them", ints: ["Space"], budget: "75", notes: "wants a pottery class" }), env, ctx);
await Promise.all(waits.splice(0));
assert.ok((await r.json()).map(i => i.title).includes("Pottery class"));

r = await worker.fetch(req("/signal", { kept: ["Moon phase desk lamp"], top: ["Star map poster"], cut: ["Pottery class", "pottery CLASS"], have: [] }), env, ctx);
await Promise.all(waits.splice(0));
const day = sql.prepare("SELECT * FROM pick_stats").all();
assert.equal(day.length, 1);
assert.deepEqual([day[0].kept, day[0].top, day[0].cut, day[0].have], [1, 1, 1, 0]);
assert.ok(day[0].shown >= 5, "shown counts both rounds");

// With CROWD off, no hints.
await worker.fetch(req("/", { n: 2, forWho: "them", ints: ["Space"], budget: "75" }), { ...env, CROWD: "off" }, ctx);
await Promise.all(waits.splice(0));
assert.doesNotMatch(prompt, /often cut these/);
console.log("crowd tests passed");
