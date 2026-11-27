// Test free round limits with a real SQLite database (node:sqlite) standing in for D1.
// Run: node server/ai-ideas/test/limits.test.mjs   (Node 22 or newer)
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
let fail = false;
const AI = { async run() { if (fail) throw new Error("boom"); return { response: JSON.stringify([{ title: "Cozy throw blanket " + Math.random(), category: "Room", lo: 20, hi: 40, why: "Warm nights in", search: "throw blanket" }]) } } };
const env = { AI, KV, DB, BETA_ONLY: "false", BACKUP_MODEL: "off", TRIAL_ROUNDS: "3", TRIAL_PER_NETWORK: "3", BETA_ROUNDS: "15", BETA_PER_NETWORK: "30",
  BETA_CODE: "TEST-CODE-1234", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const ctx = { waitUntil() {} };
const ask = (dev, ip, code) => worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ n: 1 }), headers: {
  Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": ip, ...(code ? { "x-beta-code": code } : {}) } }), env, ctx);

// Public: 3 rounds, then a new device id on the same network is still blocked.
for (let i = 0; i < 3; i++) { const r = await ask("deviceAAAAAAAAAAAAAA", "1.2.3.4"); assert.equal(r.status, 200); assert.equal(r.headers.get("x-trial-left"), String(2 - i)); }
assert.equal((await ask("deviceAAAAAAAAAAAAAA", "1.2.3.4")).status, 402, "4th round, same device");
assert.equal((await ask("deviceBBBBBBBBBBBBBB", "1.2.3.4")).status, 402, "cleared storage, same network");
assert.equal((await ask("deviceAAAAAAAAAAAAAA", "5.6.7.8")).status, 402, "same device, new network");
// IPv6: same /64 counts as one network.
for (let i = 0; i < 3; i++) assert.equal((await ask("deviceCCCCCCCCCCCCCC" + i, "2001:db8:1:2::" + (i + 1))).status, i === 0 ? 200 : 200);
assert.equal((await ask("deviceDDDDDDDDDDDDDD", "2001:db8:1:2:ffff::9")).status, 402, "same IPv6 /64");
// Failed rounds are handed back.
fail = true; assert.equal((await ask("deviceEEEEEEEEEEEEEE", "9.9.9.9")).status, 429); fail = false;
for (let i = 0; i < 3; i++) assert.equal((await ask("deviceEEEEEEEEEEEEEE", "9.9.9.9")).status, 200, "failure did not use a round");
// Parallel burst can't get past 3.
const burst = await Promise.all(Array.from({ length: 8 }, () => ask("deviceFFFFFFFFFFFFFF", "10.0.0.1")));
assert.equal(burst.filter(r => r.status === 200).length, 3, "burst");
// Beta code: 15 rounds, separate from the public count on the same network.
let ok = 0; for (let i = 0; i < 17; i++) if ((await ask("deviceAAAAAAAAAAAAAA", "1.2.3.4", "test-code-1234")).status === 200) ok++;
assert.equal(ok, 15, "beta rounds");
// Wrong code is treated as public (already used up here).
assert.equal((await ask("deviceGGGGGGGGGGGGGG", "1.2.3.4", "WRONG-CODE-999")).status, 402);
// No device id: no trial.
assert.equal((await ask("", "11.0.0.1")).status, 402);
// Nothing personal stored: only hashed keys.
const rows = sql.prepare("SELECT k FROM ai_use").all().map(r => r.k).join(" ");
assert.ok(!/device|1\.2\.3\.4|2001/.test(rows), rows);
assert.equal(worker._test.network("2001:DB8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
assert.equal(worker._test.network("2001:db8::1"), "2001:db8:0:0::/64");
console.log("all limit tests passed");
