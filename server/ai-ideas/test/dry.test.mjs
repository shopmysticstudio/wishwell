// Test runs ({"dry": true}): beta code only, same AI round, nothing saved anywhere.
// Run: node server/ai-ideas/test/dry.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
for (const f of readdirSync(dir + "/migrations").sort()) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt, async batch(list) { for (const s of list) await s.run(); } };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
let prompts = [];
const reply = JSON.stringify([
  { title: "Gaming headset", category: "Gaming", lo: 50, hi: 150, why: "For her PS4 nights", search: "gaming headset" },
  { title: "Moon lamp", category: "Room", lo: 25, hi: 40, why: "Glows like the moon", search: "moon lamp" },
  { title: "Car phone mount", category: "Tech", lo: 15, hi: 40, why: "Hands free in the car", search: "car phone mount" }]);
const AI = { async run(model, input) { prompts.push(input.messages.map(m => m.content).join("\n")); return { response: reply }; } };
const env = { AI, KV, DB, BETA_CODE: "TESTCODE12", BETA_ONLY: "false", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const call = async (body, code = "TESTCODE12", dev = "") => {
  const h = { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" };
  if (code) h["x-beta-code"] = code;
  if (dev) h["x-device-id"] = dev;
  const later = [];
  const r = await worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify(body), headers: h }), env, { waitUntil(p) { later.push(p); } });
  await Promise.all(later);
  return [r.status, await r.json(), r.headers];
};
sql.exec(`INSERT INTO ideas (key, title, category, lo_sum, hi_sum, shown, kept, top, cut, first_day, last_day) VALUES
 ('moon lamp','Moon lamp','Room',50,80,2,3,1,0,'2026-11-01','2026-11-02')`);
sql.exec(`INSERT INTO idea_tags VALUES ('moon lamp','int:Gaming',2)`);
const snap = () => JSON.stringify([
  sql.prepare("SELECT key, shown, kept, cut, lo_sum FROM ideas ORDER BY key").all(),
  sql.prepare("SELECT * FROM idea_tags ORDER BY key, tag").all(),
  sql.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
    .filter(n => n !== "ai_use").map(n => [n, sql.prepare(`SELECT COUNT(*) n FROM "${n}"`).get().n])]);
const body = { dry: true, n: 3, forWho: "them", age: "adult", ints: ["Gaming", "Tech", "Cars"], budget: "any", notes: "38, has a PS4 and a car" };

// Needs the beta code.
assert.equal((await call(body, ""))[0], 403);
assert.equal((await call(body, "WRONGCODE9"))[0], 403);
// A test run answers ideas with where each came from, and saves nothing.
const before = snap();
let [s, b, h] = await call(body);
assert.equal(s, 200);
assert.equal(b.dry, true); assert.equal(b.saved, false);
assert.equal(b.ideas.length, 3);
assert.deepEqual(b.ideas.map(i => i.from), ["ai", "crowd", "ai"]);
assert.deepEqual(b.hints.liked, ["Moon lamp"]);
assert.equal(b.ideas[0].lo, 50);
assert.match(prompts.at(-1), /Other people with these interests kept ideas like: Moon lamp/);
assert.equal(snap(), before, "nothing saved");
assert.equal(h.get("x-dry-left"), "24");
assert.equal([...store.keys()].length, 0, "no KV writes");
// No device id needed, and a device's own rounds are untouched.
assert.equal(sql.prepare("SELECT COUNT(*) n FROM ai_use WHERE k LIKE 'dev:%' OR k LIKE 'dd:%'").get().n, 0);
// It counts toward the everyone-together daily cap.
assert.equal(sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'gd:%'").get().n, 1);
// crowd: false leaves out the crowd hints.
[s, b] = await call({ ...body, crowd: false });
assert.equal(s, 200); assert.deepEqual(b.hints.liked, []);
assert.doesNotMatch(prompts.at(-1), /Other people with these interests/);
assert.deepEqual(b.ideas.map(i => i.from), ["ai", "ai", "ai"]);
assert.equal(snap(), before, "still nothing saved");
// Its own daily cap.
env.DRY_DAILY = "2";
[s, b] = await call(body);
assert.equal(s, 429); assert.equal(b.error, "dry_limit");
delete env.DRY_DAILY;
// A failed round gives the test run back.
const keep = AI.run; AI.run = async () => ({ response: "no json here" });
const n0 = sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'dry:%'").get().n;
[s, b] = await call(body);
assert.equal(s, 429);
assert.equal(sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'dry:%'").get().n, n0);
AI.run = keep;
// Without dry, the same body is a normal round and does save to the pool.
[s, b] = await call({ ...body, dry: false }, "TESTCODE12", "devicedevice1234");
assert.equal(s, 200); assert.ok(Array.isArray(b));
assert.notEqual(snap(), before);
console.log("dry ok");
