// Test the launch waitlist with a real SQLite database (node:sqlite) standing in for D1.
// Run: node server/ai-ideas/test/waitlist.test.mjs   (Node 22 or newer)
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const stmt = q => { const st = { args: [], bind(...a) { st.args = a; return st; },
  async run() { return /\?\d/.test(q) ? sql.prepare(q).run(named(st.args)) : sql.prepare(q).run(...st.args); },
  async first() { const r = /\?\d/.test(q) ? sql.prepare(q).get(named(st.args)) : sql.prepare(q).get(...st.args); return r ?? null; } }; return st; };
const store = new Map();
const env = { DB: { prepare: stmt }, KV: { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } },
  BETA_ONLY: "true", WAITLIST_PER_NETWORK: "3", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const join = (body, ip, origin = "https://shopmysticstudio.github.io") => worker.fetch(new Request("https://w.example/waitlist", { method: "POST", body: JSON.stringify(body),
  headers: { Origin: origin, "content-type": "application/json", "CF-Connecting-IP": ip } }), env, { waitUntil() {} });
assert.equal((await join({ email: " Leo.Test@Example.com " }, "1.1.1.1")).status, 200, "works even while AI is beta only");
assert.equal((await join({ email: "leo.test@example.com" }, "2.2.2.2")).status, 200, "duplicate answers the same");
assert.equal((await join({ email: "not-an-email" }, "2.2.2.2")).status, 400);
assert.equal((await join({ email: "bot@example.com", website: "spam.example" }, "3.3.3.3")).status, 200);
assert.equal((await join({ email: "x@example.com" }, "4.4.4.4", "https://evil.example")).status, 403);
for (let i = 0; i < 3; i++) assert.equal((await join({ email: "n" + i + "@example.com" }, "5.5.5.5")).status, 200);
assert.equal((await join({ email: "n9@example.com" }, "5.5.5.5")).status, 429, "per network cap");
const rows = sql.prepare("SELECT email FROM waitlist ORDER BY email").all().map(r => r.email);
assert.deepEqual(rows, ["leo.test@example.com", "n0@example.com", "n1@example.com", "n2@example.com"]);
assert.deepEqual(Object.keys(sql.prepare("SELECT * FROM waitlist LIMIT 1").get()), ["email", "added"]);
console.log("all waitlist tests passed");
