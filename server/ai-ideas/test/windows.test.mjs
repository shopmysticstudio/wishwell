// Public site limits: 2 a day and 10 a week per device, an optional per-network cap, and a cap for everyone together. Run: node server/ai-ideas/test/windows.test.mjs
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
  async first() { const r = /\?\d/.test(q) ? sql.prepare(q).get(named(st.args)) : sql.prepare(q).get(...st.args); return r ?? null; } }; return st; };
const DB = { prepare: stmt, async batch(sts) { for (const s of sts) await s.run(); } };
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
let fail = false;
const AI = { async run() { if (fail) throw new Error("boom"); return { response: JSON.stringify([{ title: "Cozy throw blanket " + Math.random(), category: "Room", lo: 20, hi: 40, why: "Warm nights in", search: "throw blanket" }]) } } };
const env = { AI, KV, DB, BETA_ONLY: "false", BACKUP_MODEL: "off", TRIAL_DAILY: "2", TRIAL_WEEKLY: "10", TRIAL_DAY_START_HOUR_UTC: "5",
  TRIAL_ROUNDS: "3", TRIAL_PER_NETWORK: "off", TRIAL_NET_DAILY: "off", TRIAL_NET_WEEKLY: "off", BETA_ROUNDS: "15", BETA_PER_NETWORK: "off", BETA_CODE: "TEST-CODE-1234", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const ctx = { waitUntil() {} };
const realNow = Date.now;
let clock = Date.UTC(2026, 10, 30, 15, 0, 0);   // Monday Nov 30 2026, 10 AM Eastern
Date.now = () => clock;
const ask = (dev, ip, code) => worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ n: 1 }), headers: {
  Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": ip, ...(code ? { "x-beta-code": code } : {}) } }), env, ctx);
const W = worker._test.windows;
// Window math: Monday 10 AM Eastern; day ends at 5 AM UTC Tuesday, week ends next Monday 5 AM UTC.
const w = W(5, clock);
assert.equal(new Date(w.dayEnd * 1000).toISOString(), "2026-12-01T05:00:00.000Z");
assert.equal(new Date(w.weekEnd * 1000).toISOString(), "2026-12-07T05:00:00.000Z");
assert.equal(W(5, Date.UTC(2026, 11, 7, 4, 59)).week, w.week, "Sunday night Eastern is the same week");
assert.equal(W(5, Date.UTC(2026, 11, 7, 5, 0)).week, w.week + 1, "Monday midnight Eastern starts a new week");

const A = "deviceAAAAAAAAAAAAAA", ip = "1.2.3.4";
// Day 1: 2 rounds, the 3rd is refused with the day limit and tomorrow's reset.
let r = await ask(A, ip); assert.equal(r.status, 200); assert.equal(r.headers.get("x-trial-left"), "1"); assert.equal(r.headers.get("x-trial-limit"), "day");
r = await ask(A, ip); assert.equal(r.status, 200); assert.equal(r.headers.get("x-trial-left"), "0");
r = await ask(A, ip); assert.equal(r.status, 402, "3rd round in a day");
let b = await r.json(); assert.equal(b.limit, "day"); assert.equal(b.reset, w.dayEnd); assert.equal(r.headers.get("x-trial-reset"), String(w.dayEnd));
assert.equal((await ask("deviceBBBBBBBBBBBBBB", ip)).status, 200, "another device on the same Wi-Fi has its own rounds");
assert.equal((await ask(A, "5.6.7.8")).status, 402, "same device, other network, same day");
// A failed round is handed back.
clock += 86400e3; fail = true; assert.equal((await ask(A, ip)).status, 429); fail = false;
// Days 2 to 5: 2 rounds each, total 10 for the week.
for (let d = 2; d <= 5; d++) {
  if (d > 2) clock += 86400e3;
  assert.equal((await ask(A, ip)).status, 200, "day " + d + " round 1");
  r = await ask(A, ip); assert.equal(r.status, 200, "day " + d + " round 2");
  if (d === 5) { assert.equal(r.headers.get("x-trial-left"), "0"); }
}
// Day 6 (Saturday): weekly cap of 10 is spent, so the 11th is refused with the week limit.
clock += 86400e3;
r = await ask(A, ip); assert.equal(r.status, 402, "11th round in a week");
b = await r.json(); assert.equal(b.limit, "week"); assert.equal(b.reset, w.weekEnd);
assert.equal((await ask("deviceCCCCCCCCCCCCCC", ip)).status, 200, "another device on the same network, week used up on the first");
// Next Monday: fresh.
clock = Date.UTC(2026, 11, 7, 5, 1);
r = await ask(A, ip); assert.equal(r.status, 200, "new week"); assert.equal(r.headers.get("x-trial-left"), "1");
// x-trial-left says what binds: after 8 rounds the week has 2 left while today has 2 too; after 9, week has 1 and day 1.
// Beta code is still 15 total and ignores the daily limit.
let ok = 0; for (let i = 0; i < 17; i++) if ((await ask("deviceDDDDDDDDDDDDDD", "8.8.8.8", "test-code-1234")).status === 200) ok++;
assert.equal(ok, 15, "beta rounds");
// Parallel burst can't get past 2 in a day.
const burst = await Promise.all(Array.from({ length: 6 }, () => ask("deviceEEEEEEEEEEEEEE", "10.0.0.1")));
assert.equal(burst.filter(x => x.status === 200).length, 2, "burst");
// The per-network switch: set to a number, a network's devices share that many a day.
env.TRIAL_NET_DAILY = "3";
assert.equal((await ask("deviceNET1NET1NET1NE1", "20.0.0.1")).status, 200);
assert.equal((await ask("deviceNET1NET1NET1NE1", "20.0.0.1")).status, 200);
assert.equal((await ask("deviceNET2NET2NET2NE2", "20.0.0.1")).status, 200);
r = await ask("deviceNET2NET2NET2NE2", "20.0.0.1"); assert.equal(r.status, 402, "network cap on"); assert.equal((await r.json()).limit, "day");
env.TRIAL_NET_DAILY = "off";
// Everyone together: past TRIAL_GLOBAL_DAILY, ai_busy (429) even for a fresh device, and beta too.
clock += 86400e3; env.TRIAL_GLOBAL_DAILY = "3";
for (const d of ["deviceG1G1G1G1G1G1G1G1", "deviceG2G2G2G2G2G2G2G2", "deviceG3G3G3G3G3G3G3G3"]) assert.equal((await ask(d, "30.0.0." + d.length)).status, 200);
r = await ask("deviceG4G4G4G4G4G4G4G4", "30.0.0.9"); assert.equal(r.status, 429); assert.equal((await r.json()).error, "ai_busy");
assert.equal((await ask("deviceG5G5G5G5G5G5G5G5", "30.0.0.9", "test-code-1234")).status, 429, "beta shares the cap");
r = await ask("deviceG1G1G1G1G1G1G1G1", "30.0.0.9"); assert.equal(r.status, 429, "busy before own limit");
env.TRIAL_GLOBAL_DAILY = "40";
const rows = sql.prepare("SELECT k FROM ai_use").all().map(r => r.k).join(" ");
assert.ok(!/device|1\.2\.3\.4/.test(rows), rows);
Date.now = realNow;
console.log("all window tests passed");
