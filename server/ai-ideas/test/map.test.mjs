// Test the beta gift map: list the pool with factors, score missing factors with the small model, beta only.
// Run: node server/ai-ideas/test/map.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const T = worker._test;
const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync(dir + "/migrations/0001_idea_pool.sql", "utf8"));
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt };
let calls = 0, reply = "";
const AI = { async run(model, input) { calls++; assert.match(model, /8b/); return { response: reply }; } };
const env = { DB, AI, BETA_CODE: "TESTCODE12", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost" };
const call = async (path, body, code = "TESTCODE12", origin = "https://shopmysticstudio.github.io") => {
  const h = { Origin: origin, "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" };
  if (code) h["x-beta-code"] = code;
  const r = await worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body), headers: h }), env, { waitUntil() {} });
  return [r.status, await r.json()];
};
sql.exec(`INSERT INTO ideas (key, title, category, lo_sum, hi_sum, shown, kept, top, cut, first_day, last_day) VALUES
 ('moon lamp','Moon lamp','Room',50,80,2,3,1,0,'2026-11-01','2026-11-02'), ('trail socks','Trail socks','Outdoors',10,20,1,0,0,2,'2026-11-01','2026-11-01')`);
sql.exec(`INSERT INTO idea_tags VALUES ('moon lamp','int:Space and science',2),('moon lamp','budget:75',2)`);

// Beta only, and not from the app.
assert.equal((await call("/map", {}, ""))[0], 429);
assert.equal((await call("/map", {}, "WRONGCODE9"))[0], 429);
// The Android app (version 5) may read the list without a code, but never score.
{ const [st, bd] = await call("/map", {}, "", "https://localhost"); assert.equal(st, 200); assert.ok(Array.isArray(bd.pool)); assert.equal(typeof bd.f, "object"); }
assert.equal((await call("/map/score", { ideas: [] }, "", "https://localhost"))[0], 403);
assert.equal((await call("/map/score", { ideas: [] }, "TESTCODE12", "https://localhost"))[0], 403);
// List: makes the table on first use, averages prices, carries interest tags.
let [s, b] = await call("/map", {});
assert.equal(s, 200); assert.equal(b.pool.length, 2);
const moon = b.pool.find(p => p.k === "moon lamp");
assert.deepEqual([moon.lo, moon.hi, moon.kept, moon.ints], [25, 40, 3, ["Space and science"]]);
assert.deepEqual(b.f, {});
// Score: messy model reply, clamped, unknown interests dropped, brands and repeats skipped.
reply = 'Here you go: [{"i":0,"kid":1,"teen":1,"adult":1,"hands":1,"social":0,"lasting":4,"outdoor":0,"skill":0,"ints":["Space and science","Room setup","Wizardry"]},' +
  ' {"i":1,"kid":0,"teen":"1","adult":1,"hands":9,"social":-2,"lasting":2,"outdoor":4,"skill":"x","ints":"Outdoors; sports"}, {"i":7,"hands":1}]';
[s, b] = await call("/map/score", { items: [{ t: "Moon lamp", c: "Room" }, { t: "Trail socks", c: "Outdoors" }, { t: "Trail socks", c: "Outdoors" }, { t: "LEGO castle", c: "Making" }] });
assert.equal(s, 200); assert.equal(calls, 1); assert.equal(b.scored.length, 2);
const f0 = b.scored[0].f;
assert.deepEqual([f0.age, f0.hands, f0.social, f0.lasting, f0.outdoor, f0.skill], [[1, 1, 1], 1, 0, 4, 0, 0]);
assert.ok(b.scored[0].f.ints.includes("Space and science") && !b.scored[0].f.ints.includes("Wizardry"));
const f1 = b.scored[1].f;
assert.deepEqual([f1.age, f1.hands, f1.social, f1.lasting, f1.outdoor, f1.skill], [[0, 1, 1], 4, 0, 2, 4, 2]);
assert.deepEqual([...f1.ints].sort(), ["Outdoors", "Sports"]);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM idea_factors").get().n, 2);
// Already scored: no model call.
[s, b] = await call("/map/score", { items: [{ t: "Moon lamp", c: "Room" }] });
assert.deepEqual(b.scored, []); assert.equal(calls, 1);
// The list now has the factors.
[s, b] = await call("/map", {});
assert.equal(b.f["moon lamp"].lasting, 4);
// Daily cap.
env.MAP_SCORE_DAY = "2";
[s, b] = await call("/map/score", { items: [{ t: "Star atlas", c: "Books" }] });
assert.equal(b.full, true); assert.equal(calls, 1);
delete env.MAP_SCORE_DAY;
// A model failure answers cleanly.
AI.run = async () => { throw new Error("boom"); };
[s, b] = await call("/map/score", { items: [{ t: "Star atlas", c: "Books" }] });
assert.equal(s, 200); assert.equal(b.error, "ai_failed");
// At most 25 a call.
assert.equal(T.mapItems({ items: Array.from({ length: 40 }, (_, i) => ({ t: "Idea " + i, c: "Tech" })) }).length, 25);
console.log("map ok");
