// Beta on-device ranking support: /pool, /rank, /findings, swipe links and the leftover-AI gap job.
// Run: node server/ai-ideas/test/ondevice.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
const KV = { async get() { return null }, async put() {} };
let aiCalls = 0;
const AI = { async run() { aiCalls++; return { response: JSON.stringify([
  { title: "Cartoon dog plush", category: "Room", lo: 15, hi: 30, why: "Cuddly pup", search: "dog plush" },
  { title: "Bluey play house", category: "Other", lo: 40, hi: 60, why: "x", search: "x" },
  { title: "Family board game", category: "Gaming", lo: 20, hi: 35, why: "Game night", search: "board game" }]), usage: { neurons: 30 } }; } };
const env = { AI, KV, DB, BETA_CODE: "TESTCODE12", BETA_ONLY: "false", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const call = async (path, body, code = "TESTCODE12") => {
  const h = { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "CF-Connecting-IP": "1.2.3.4" };
  if (code) h["x-beta-code"] = code;
  const later = [];
  const r = await worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body), headers: h }), env, { waitUntil(p) { later.push(p); } });
  await Promise.all(later);
  return [r.status, r.status === 204 ? null : await r.json()];
};
const day = new Date().toISOString().slice(0, 10);
sql.exec(`INSERT INTO ideas (key, title, category, lo_sum, hi_sum, shown, kept, top, cut, first_day, last_day) VALUES
 ('beginner telescope','Beginner telescope','Science',100,200,2,3,1,0,'${day}','${day}'),
 ('portable power bank','Portable power bank','Tech',40,80,2,2,0,0,'${day}','${day}'),
 ('weather station','Weather station','Science',60,100,2,1,0,0,'${day}','${day}')`);
sql.exec(`INSERT INTO idea_factors VALUES ('beginner telescope','Beginner telescope','Science','{"age":[0,1,1],"ints":["Space and science"]}','m','${day}'),
 ('portable power bank','Portable power bank','Tech','{"age":[0,1,1],"ints":["Tech"]}','m','${day}'),
 ('weather station','Weather station','Science','{"age":[0,1,1],"ints":["Space and science"]}','m','${day}')`);
sql.exec(`INSERT INTO rounds (list_id, round, day, hour, surface, source, age, budget) VALUES ('l1',1,'${day}',9,'beta','ai','teen','any')`);
sql.exec(`INSERT INTO round_ideas (list_id, round, pos, idea_key, title, category, src, outcome) VALUES ('l1',1,0,'weather station','Weather station','Science','ai','kept'),('l1',1,1,'portable power bank','Portable power bank','Tech','ai','cut')`);

// Beta code needed.
assert.equal((await call("/pool", {}, ""))[0], 429);
let [s, b] = await call("/pool", {});
assert.equal(s, 200);
assert.equal(b.pool.length, 3);
assert.deepEqual(b.seeds["teen|any"].map(x => x[0]), ["Weather station"]);
assert.ok(b.f["weather station"]);

// Server ranking with no AI: a Space fan gets the telescope and weather station, not the power bank.
[s, b] = await call("/rank", { n: 4, ints: ["Space and science"], budget: "any", age: "teen" });
assert.equal(s, 200);
assert.deepEqual(b.ideas.map(i => i.title).sort(), ["Beginner telescope", "Weather station"]);
assert.equal(aiCalls, 0);

// Findings: plain words and brand hashes are kept, a name hash is not.
const h = w => "h:" + createHash("sha256").update("wishwell-term:" + w).digest("hex").slice(0, 16);
[s] = await call("/findings", { dups: [["Moon lamp", "Moon phase lamp", 91]], gaps: ["weather", h("bluey"), h("sam"), "Weather!", "x"], m: [["space and science", "Beginner telescope", "kept"], ["cozy", "Weather station", "none"], ["sam", "Weather station", "cut"]] });
assert.equal(s, 204);
assert.deepEqual(sql.prepare("SELECT term FROM finding_gaps ORDER BY term").all().map(r => r.term), ["bluey", "weather"]);
assert.deepEqual(sql.prepare("SELECT a, b, sim FROM finding_dups").all().map(r => ({ ...r })), [{ a: "moon lamp", b: "moon phase lamp", sim: 91 }]);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM finding_matches").get().n, 3, "sam is a plain lowercase word, kept as a word");
assert.equal(sql.prepare("SELECT kept FROM finding_matches WHERE term = 'space and science'").get().kept, 1);

// Gap job: fills words reported twice, within what's left of the day, and logs its use.
await call("/findings", { gaps: [h("bluey")] });
sql.exec(`INSERT INTO ai_use (k, n, exp) VALUES ('use:${day}:ideas:x', 9500, 0), ('calls:${day}:ideas:x', 40, 0)`);
let r = await worker._test.gapFill(env);
assert.equal(r.ran, 0, "no room left after the margin");
sql.exec(`UPDATE ai_use SET n = 2000 WHERE k = 'use:${day}:ideas:x'`);
r = await worker._test.gapFill(env);
assert.equal(r.ran, 1);
assert.deepEqual(r.terms, ["bluey"]);
assert.deepEqual(sql.prepare("SELECT title FROM gap_ideas ORDER BY title").all().map(x => x.title), ["Cartoon dog plush", "Family board game"]);
assert.ok(sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'use:%:gap:%'").get().n >= 30);
[s, b] = await call("/pool", {});
assert.ok(b.pool.some(p => p.t === "Cartoon dog plush" && p.gap === "bluey"));

// Swipe link: the giver stores a deck, the person swipes once without a code, the giver reads it back.
[s, b] = await call("/swipe/new", { deck: [1, 2, 3, 4, 5, 6].map(i => ({ t: "Idea " + i, c: "Room" })).concat([{ t: "Lego set", c: "Making" }]) });
assert.equal(s, 200);
const id = b.id;
[s, b] = await call("/swipe/get", { id }, "");
assert.equal(b.deck.length, 6, "brand titles left out");
[s, b] = await call("/swipe/vote", { id, v: [1, 0, 1, 1, 0, 1] }, "");
assert.equal(b.ok, true);
[s, b] = await call("/swipe/vote", { id, v: [0, 0, 0, 0, 0, 0] }, "");
assert.equal(b.already, true);
assert.equal((await call("/swipe/votes", { id }, ""))[0], 429);
[s, b] = await call("/swipe/votes", { id });
assert.deepEqual(b.votes, [1, 0, 1, 1, 0, 1]);
assert.equal(sql.prepare("SELECT likes FROM swipe_votes WHERE key = 'idea 1'").get().likes, 1);
// Round log takes the new sources.
assert.ok(worker._test.cleanLog({ lid: "a".repeat(32), r: 1, s: "beta", src: "mixed", ideas: [{ p: 0, t: "Weather station", c: "Science", src: "pool" }] }).ideas[0].src === "pool");
console.log("ondevice ok");
