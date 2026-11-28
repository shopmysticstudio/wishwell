// Test that background AI never takes daily AI from live rounds: gift map scoring waits for the nightly
// leftover job (mapFill) unless MAP_SCORE is "live", and a reply with only token counts is still logged
// in neurons (Cloudflare's per-model rates), so the nightly jobs know what is left.
// Run: node server/ai-ideas/test/night.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const T = worker._test;
const sql = new DatabaseSync(":memory:");
for (const f of readdirSync(dir + "/migrations").sort()) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
sql.exec("CREATE TABLE IF NOT EXISTS ai_use (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS idea_factors (key TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, f TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', day TEXT NOT NULL)");
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt, async batch(list) { for (const s of list) await s.run(); } };
let calls = 0;
const factors = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({ i, kid: 0, teen: 1, adult: 1, hands: 1, social: 1, lasting: 3, outdoor: 0, skill: 1 })));
// Token counts only, no neurons: 1,000 in and 1,000 out on the small model is 4 + 35 = 39 neurons.
const AI = { async run(model, input) { calls++; const n = (input.messages[1].content.match(/^\d+\. /gm) || []).length; return { response: factors(n), usage: { prompt_tokens: 1000, completion_tokens: 1000 } }; } };
const env = { DB, AI, BETA_CODE: "TESTCODE12", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const call = async (path, body) => {
  const h = { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4", "x-beta-code": "TESTCODE12" };
  const r = await worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body), headers: h }), env, { waitUntil() {} });
  return [r.status, await r.json()];
};
const day = new Date().toISOString().slice(0, 10);
const get = k => (sql.prepare("SELECT n FROM ai_use WHERE k = ?").get(k) || {}).n || 0;
for (let i = 0; i < 30; i++) sql.exec(`INSERT INTO ideas (key, title, category, lo_sum, hi_sum, shown, kept, top, cut, first_day, last_day) VALUES ('idea ${i}', 'Idea ${i}', 'Tech', 10, 20, 1, 0, 0, 0, '${day}', '${day}')`);

// By default, opening the map scores nothing now: no AI call, and the page stops asking.
let [s, b] = await call("/map/score", { items: [{ t: "Idea 1", c: "Tech" }] });
assert.equal(s, 200); assert.deepEqual(b.scored, []); assert.equal(b.full, true); assert.equal(calls, 0);
// "off" also scores nothing at night.
env.MAP_SCORE = "off"; assert.equal((await T.mapFill(env)).reason, "off"); assert.equal(calls, 0); delete env.MAP_SCORE;
// Nothing used today yet: the nightly job scores all 30 in two calls, and logs neurons from token counts.
let r = await T.mapFill(env);
assert.equal(r.scored, 30); assert.equal(calls, 2); assert.equal(r.reason, "done");
assert.equal(get(`use:${day}:map:llama-3.1-8b-instruct-fp8-fast`), 78);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM idea_factors").get().n, 30);
// With the day nearly used up (past DAILY_NEURONS minus GAP_MARGIN), it makes no call.
for (let i = 30; i < 35; i++) sql.exec(`INSERT INTO ideas (key, title, category, lo_sum, hi_sum, shown, kept, top, cut, first_day, last_day) VALUES ('idea ${i}', 'Idea ${i}', 'Tech', 10, 20, 1, 0, 0, 0, '${day}', '${day}')`);
sql.exec(`INSERT INTO ai_use (k, n, exp) VALUES ('use:${day}:ideas:llama-3.3-70b-instruct-fp8-fast', 6900, 0)`);
r = await T.mapFill(env);
assert.equal(r.reason, "no_room"); assert.equal(calls, 2);
// When calls were made but none reported use, it doesn't guess.
sql.exec("DELETE FROM ai_use"); sql.exec(`INSERT INTO ai_use (k, n, exp) VALUES ('calls:${day}:ideas:x', 3, 0)`);
assert.equal((await T.mapFill(env)).reason, "use_unknown"); assert.equal(calls, 2);
// "live" brings back scoring on request.
sql.exec("DELETE FROM ai_use"); env.MAP_SCORE = "live";
[s, b] = await call("/map/score", { items: [{ t: "Idea 31", c: "Tech" }] });
assert.equal(b.scored.length, 1); assert.equal(calls, 3);
console.log("night tests passed");
