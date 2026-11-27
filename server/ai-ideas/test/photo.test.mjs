// Test the beta-only /photo route: needs the beta code, checks the image, counts one round.
// Run: node server/ai-ideas/test/photo.test.mjs   (Node 22 or newer)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
for (const f of ["0001_idea_pool.sql", "0002_have.sql"]) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const stmt = q => { const st = { args: [], bind(...a) { st.args = a; return st; },
  async run() { return /\?\d/.test(q) ? sql.prepare(q).run(named(st.args)) : sql.prepare(q).run(...st.args); },
  async first() { const r = /\?\d/.test(q) ? sql.prepare(q).get(named(st.args)) : sql.prepare(q).get(...st.args); return r ?? null; },
  q }; return st; };
const DB = { prepare: stmt, async batch(sts) { for (const s of sts) await s.run(); } };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
let reply = "", seen = null;
const AI = { async run(model, input) { seen = { model, input }; return { response: reply } } };
const env = { AI, KV, DB, BETA_ONLY: "false", BACKUP_MODEL: "off", TRIAL_ROUNDS: "3", BETA_ROUNDS: "15", BETA_PER_NETWORK: "30",
  BETA_CODE: "TEST-CODE-1234", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const img = "data:image/jpeg;base64," + "A".repeat(4000);
const ask = (body, code, dev = "devicePPPPPPPPPPPPPP") => worker.fetch(new Request("https://w.example/photo", { method: "POST", body: JSON.stringify(body), headers: {
  Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": "7.7.7.7", ...(code ? { "x-beta-code": code } : {}) } }), env, { waitUntil() {} });

assert.equal((await ask({ image: img })).status, 403, "public site can't use photos");
assert.equal((await ask({ image: "https://evil.example/x.jpg" }, "TEST-CODE-1234")).status, 400, "only inline images");
assert.equal((await ask({ image: "data:image/svg+xml;base64,AAAA" }, "TEST-CODE-1234")).status, 400, "no svg");
reply = "Here you go: " + JSON.stringify([{ name: "Stanley tumbler", category: "Food", lo: "$35", hi: 45, search: "40 oz tumbler" },
  { title: "Wireless earbuds", category: "tech", lo: 30, hi: 80 }, { title: "Wireless earbuds", category: "Tech" }, "junk"]);
let r = await ask({ image: img }, "TEST-CODE-1234");
assert.equal(r.status, 200);
const d = await r.json();
assert.deepEqual(d.items.map(i => i.title), ["Stanley tumbler", "Wireless earbuds"]);
assert.equal(d.items[0].lo, 35); assert.equal(d.items[1].category, "Tech"); assert.equal(d.items[1].search, "Wireless earbuds");
assert.equal(r.headers.get("x-trial-left"), "14", "one beta round used");
assert.match(seen.model, /llama-4-scout/);
assert.equal(seen.input.messages[1].content[1].image_url.url, img);
// Nothing found: the round is handed back.
reply = "[]";
assert.equal((await ask({ image: img }, "TEST-CODE-1234")).status, 429);
reply = JSON.stringify([{ title: "Board game", category: "Gaming", lo: 20, hi: 40 }]);
r = await ask({ image: img }, "TEST-CODE-1234");
assert.equal(r.headers.get("x-trial-left"), "13", "the empty round was handed back");
// Too big.
assert.equal((await ask({ image: "data:image/jpeg;base64," + "A".repeat(800000) }, "TEST-CODE-1234")).status, 413);
console.log("all photo tests passed");
