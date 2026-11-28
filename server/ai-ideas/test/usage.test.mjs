// Test the AI usage log: every Workers AI call adds its neurons, a call count and any failure
// to daily totals in ai_use (use:/calls:/fail:<UTC day>:<job>:<model>).
// Run: node server/ai-ideas/test/usage.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
for (const f of readdirSync(dir + "/migrations").sort()) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
sql.exec("CREATE TABLE IF NOT EXISTS ai_use (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL)");
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt, async batch(list) { for (const s of list) await s.run(); } };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const ideas = JSON.stringify([
  { title: "Gaming headset", category: "Gaming", lo: 50, hi: 150, why: "For game nights", search: "gaming headset" },
  { title: "Car phone mount", category: "Tech", lo: 15, hi: 40, why: "Hands free", search: "car phone mount" },
  { title: "Puzzle box", category: "Other", lo: 10, hi: 30, why: "Likes puzzles", search: "puzzle box" }]);
const factors = '[{"i":0,"kid":1,"teen":1,"adult":1,"hands":1,"social":0,"lasting":4,"outdoor":0,"skill":0}]';
let fail = false;
const AI = { async run(model, input) {
  if (fail) throw new Error("4006: you have used up your daily free allocation");
  return /8b/.test(model) ? { response: factors, usage: { neurons: 37.6 } } : { response: ideas, usage: { prompt_tokens: 1200, neurons: 140.4 } };
} };
const env = { AI, KV, DB, BETA_CODE: "TESTCODE12", BETA_ONLY: "false", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const call = async (path, body) => {
  const h = { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4", "x-beta-code": "TESTCODE12" };
  const later = [];
  const r = await worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body), headers: h }), env, { waitUntil(p) { later.push(p); } });
  await Promise.all(later);
  return [r.status, await r.json()];
};
const day = new Date().toISOString().slice(0, 10);
const get = k => (sql.prepare("SELECT n FROM ai_use WHERE k = ?").get(k) || {}).n || 0;
const big = "llama-3.3-70b-instruct-fp8-fast", small = "llama-3.1-8b-instruct-fp8-fast";

// An AI round (a test run here) logs the big model's neurons, rounded, and one call.
let [s, b] = await call("/", { dry: true, n: 3, forWho: "them", age: "adult", ints: ["Gaming", "Tech"], budget: "any" });
assert.equal(s, 200); assert.equal(b.ideas.length, 3);
assert.equal(get(`use:${day}:ideas:${big}`), 140);
assert.equal(get(`calls:${day}:ideas:${big}`), 1);
// Two map batches add up.
[s] = await call("/map/score", { items: [{ t: "Moon lamp", c: "Room" }] });
assert.equal(s, 200);
[s] = await call("/map/score", { items: [{ t: "Trail socks", c: "Outdoors" }] });
assert.equal(get(`use:${day}:map:${small}`), 76);
assert.equal(get(`calls:${day}:map:${small}`), 2);
assert.equal(get(`fail:${day}:map:${small}`), 0);
// A failed call (the free amount ran out) counts as a call and a failure, with no neurons.
fail = true;
[s, b] = await call("/map/score", { items: [{ t: "Desk fan", c: "Room" }] });
assert.equal(b.error, "ai_failed");
assert.equal(get(`calls:${day}:map:${small}`), 3);
assert.equal(get(`fail:${day}:map:${small}`), 1);
assert.equal(get(`use:${day}:map:${small}`), 76);
[s, b] = await call("/", { dry: true, n: 3, forWho: "them", age: "adult", ints: ["Gaming"], budget: "any" });
assert.equal(b.error, "ai_unavailable");
assert.equal(get(`fail:${day}:ideas:${big}`), 1);
// Rows expire in about 40 days.
const exp = sql.prepare("SELECT exp FROM ai_use WHERE k = ?").get(`use:${day}:map:${small}`).exp;
assert.ok(Math.abs(exp - (Date.now() / 1000 + 40 * 86400)) < 60);
// With no ai_use table the call still works (the log never breaks a round).
sql.exec("DROP TABLE ai_use"); fail = false;
[s] = await call("/map/score", { items: [{ t: "Desk lamp", c: "Room" }] });
assert.equal(s, 200);
console.log("usage tests passed");
