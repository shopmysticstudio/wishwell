// Test shared discount codes: add, list, vote, hide rules, no links, per-device limits.
// Run: node server/ai-ideas/test/codes.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync(dir + "/migrations/0007_codes.sql", "utf8"));
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const prep = (q, a) => /\?\d/.test(q) ? [sql.prepare(q), [named(a)]] : [sql.prepare(q), a];
const stmt = q => { const st = { q, args: [], bind(...a) { st.args = a; return st; },
  async run() { const [p, a] = prep(q, st.args); return p.run(...a); },
  async all() { const [p, a] = prep(q, st.args); return { results: p.all(...a) }; },
  async first() { const [p, a] = prep(q, st.args); return p.get(...a) ?? null; } }; return st; };
const DB = { prepare: stmt };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const env = { KV, DB, AI: {}, BETA_ONLY: "true", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost", CODES_ADDS_PER_DAY: "3" };
const ctx = { waitUntil() {} };
const call = async (path, body, dev = "deviceAAAA0000000001", origin = "https://shopmysticstudio.github.io", ip = "1.2.3.4") => {
  const r = await worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body),
    headers: { Origin: origin, "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": ip } }), env, ctx);
  return [r.status, await r.json()];
};

// Add works without the beta code, and the code is cleaned up.
let [s, b] = await call("/codes/add", { store: "target", code: " save 10 ", about: "10% off toys" });
assert.equal(s, 200); assert.equal(b.code.code, "SAVE10"); assert.equal(b.code.worked, 0);
const id = b.code.id;
// Same code again: same row, no duplicate.
[s, b] = await call("/codes/add", { store: "target", code: "save10" }, "deviceBBBB0000000002");
assert.equal(b.code.id, id);
// No links, no strange stores, no bad codes.
for (const bad of [{ store: "target", code: "X1Y2", about: "see www.scam.example" }, { store: "target", code: "X1Y2", about: "get it at deals.com" },
  { store: "target", code: "X1Y2", about: "email me@x.io" }, { store: "target", code: "X1Y2", about: "call 555 123 4567" },
  { store: "evilshop", code: "X1Y2" }, { store: "target", code: "http://x" }, { store: "target", code: "AB" }, { store: "target", code: "OLD1", expires: "2020-01-01" }])
  assert.equal((await call("/codes/add", bad))[0], 400, JSON.stringify(bad));
// Bot trap: looks fine, saves nothing.
[s, b] = await call("/codes/add", { store: "amazon", code: "BOTCODE", website: "x" });
assert.equal(s, 200); assert.equal(sql.prepare("SELECT COUNT(*) n FROM codes WHERE code='BOTCODE'").get().n, 0);
// Per-device cap (3 a day here): the first device already used 1; two more, then refused.
assert.equal((await call("/codes/add", { store: "amazon", code: "AMZ5" }))[0], 200);
assert.equal((await call("/codes/add", { store: "walmart", code: "WM5" }))[0], 200);
assert.equal((await call("/codes/add", { store: "lego", code: "LEGO5" }))[0], 429);
// Another device on the same Wi-Fi is not affected.
assert.equal((await call("/codes/add", { store: "lego", code: "LEGO5" }, "deviceCCCC0000000003"))[0], 200);
// Unless the network switch is on.
env.CODES_NET_PER_DAY = "1";
assert.equal((await call("/codes/add", { store: "rei", code: "REI1" }, "deviceDDDD0000000004", undefined, "9.9.9.9"))[0], 200);
assert.equal((await call("/codes/add", { store: "rei", code: "REI2" }, "deviceEEEE0000000005", undefined, "9.9.9.9"))[0], 429);
env.CODES_NET_PER_DAY = "off";
// Add needs a device id.
assert.equal((await call("/codes/add", { store: "rei", code: "REI3" }, ""))[0], 400);

// List, from the website and the app.
[s, b] = await call("/codes", {});
assert.equal(s, 200); assert.ok(b.codes.some(c => c.code === "SAVE10"));
[s, b] = await call("/codes", { store: "target" }, "deviceAAAA0000000001", "https://localhost");
assert.equal(s, 200); assert.deepEqual(b.codes.map(c => c.code), ["SAVE10"]);
assert.equal((await call("/", {}, undefined, "https://localhost"))[0], 403);

// Votes: one per device, changes move the count; 3 more Didn't work than Worked hides it.
await call("/codes/vote", { id, vote: "worked" });
await call("/codes/vote", { id, vote: "worked" });
assert.equal(sql.prepare("SELECT worked FROM codes WHERE id=?").get(id).worked, 1);
await call("/codes/vote", { id, vote: "failed" });
let row = sql.prepare("SELECT worked, failed FROM codes WHERE id=?").get(id);
assert.deepEqual([row.worked, row.failed], [0, 1]);
for (const d of ["deviceF000000000000001", "deviceF000000000000002"]) await call("/codes/vote", { id, vote: "failed" }, d);
assert.ok(!(await call("/codes", {}))[1].codes.some(c => c.id === id), "hidden after 3 more failed");
assert.equal((await call("/codes/vote", { id, vote: "maybe" }))[0], 400);
// Two reports hide a code; removed hides it too.
const amz = sql.prepare("SELECT id FROM codes WHERE code='AMZ5'").get().id;
for (const d of ["deviceR000000000000001", "deviceR000000000000002"]) await call("/codes/vote", { id: amz, vote: "report" }, d);
assert.ok(!(await call("/codes", {}))[1].codes.some(c => c.id === amz));
sql.exec("UPDATE codes SET removed = 1 WHERE store = 'walmart' AND code = 'WM5'");
assert.ok(!(await call("/codes", {}))[1].codes.some(c => c.code === "WM5"));
// Nothing about devices or networks in D1.
assert.doesNotMatch(JSON.stringify(sql.prepare("SELECT * FROM codes").all()), /device|1\.2\.3\.4|9\.9/);
console.log("all code tests passed");
