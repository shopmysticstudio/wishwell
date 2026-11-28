// Holiday Games: /reward bonus rounds, spending them when free rounds run out, and the Games Pass product.
// Run: node server/ai-ideas/test/reward.test.mjs   (Node 22 or newer). Gumroad is faked.
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
// Two Gumroad products: the Holiday Pass and the Games Pass.
const SALES = { HOLIDAY: { "HOLIKEY1-AAAA-BBBB-CCCC": "h@example.com" }, GAMES: { "GAMEKEY1-AAAA-BBBB-CCCC": "g@example.com" } };
globalThis.fetch = async (url, init) => {
  const b = new URLSearchParams(init.body), email = (SALES[b.get("product_id")] || {})[b.get("license_key")];
  return new Response(JSON.stringify(email ? { success: true, purchase: { email, refunded: false, chargebacked: false, disputed: false } } : { success: false }));
};
const env = { AI, KV, DB, BETA_ONLY: "false", BACKUP_MODEL: "off", TRIAL_DAILY: "2", TRIAL_WEEKLY: "10", TRIAL_DAY_START_HOUR_UTC: "5",
  TRIAL_GLOBAL_DAILY: "40", GUMROAD_PRODUCT_ID: "HOLIDAY", REWARD_DAILY: "3", REWARD_GLOBAL_DAILY: "300", BONUS_MAX: "10", BONUS_DAYS: "60",
  PASS_BAD_TRIES: "50", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost" };
const ctx = { waitUntil() {} };
let clock = Date.UTC(2026, 10, 30, 15, 0, 0);
Date.now = () => clock;
const O = "https://shopmysticstudio.github.io";
const post = (path, body, dev, ip, extra, origin) => worker.fetch(new Request("https://w.example" + path, { method: "POST", body: JSON.stringify(body), headers: {
  Origin: origin || O, "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": ip || "9.9.9.9", ...(extra || {}) } }), env, ctx);
const reward = async (level, dev, extra, ip) => { const r = await post("/reward", { level }, dev, ip, extra); return [r.status, await r.json()]; };
const ask = (dev, ip) => post("/", { n: 1 }, dev, ip);
const D = i => "deviceREWARD000000" + i;
const HOLI = { "x-pass-key": "HOLIKEY1-AAAA-BBBB-CCCC", "x-pass-email": "h@example.com" };
const GAME = { "x-pass-key": "GAMEKEY1-AAAA-BBBB-CCCC", "x-pass-email": "g@example.com", "x-pass-product": "games" };

// CORS lets the page send x-pass-product and read x-bonus-left.
let r = await worker.fetch(new Request("https://w.example/reward", { method: "OPTIONS", headers: { Origin: O } }), env, ctx);
assert.match(r.headers.get("Access-Control-Allow-Headers"), /x-pass-product/);
assert.match(r.headers.get("Access-Control-Expose-Headers"), /x-bonus-left/);
// The Android app can't call /reward.
assert.equal((await post("/reward", { level: 1 }, D(1), "1.1.1.1", null, "https://localhost")).status, 403);
// Bad input.
assert.equal((await reward(1, "short"))[0], 400);
assert.equal((await reward(0, D(1)))[0], 400);
assert.equal((await reward(26, D(1)))[0], 400);
assert.equal((await reward(2.5, D(1)))[0], 400);

// Free levels: once per level per device.
assert.deepEqual(await reward(1, D(1)), [200, { granted: true, bonus: 1 }]);
assert.deepEqual(await reward(1, D(1)), [200, { granted: false, reason: "already", bonus: 1 }]);
assert.deepEqual(await reward(2, D(1)), [200, { granted: true, bonus: 2 }]);
// Paid levels need a pass; a Holiday Pass works even without GAMES_PRODUCT_ID.
assert.deepEqual(await reward(5, D(1)), [402, { granted: false, reason: "pass_invalid" }]);
assert.deepEqual(await reward(5, D(1), GAME), [402, { granted: false, reason: "pass_invalid" }], "games key not accepted until GAMES_PRODUCT_ID is set");
assert.deepEqual(await reward(5, D(1), HOLI), [200, { granted: true, bonus: 3 }]);
// 3 a day per device.
let [st, b] = await reward(3, D(1));
assert.equal(b.reason, "daily_limit"); assert.ok(b.reset > 0);
// The level that hit the daily cap can still be claimed tomorrow (it wasn't marked as claimed).
clock += 86400000;
assert.deepEqual(await reward(3, D(1)), [200, { granted: true, bonus: 4 }]);

// GAMES_PRODUCT_ID set: either key opens paid levels and /verify product games, which says which kind.
env.GAMES_PRODUCT_ID = "GAMES";
assert.deepEqual(await reward(6, D(1), GAME), [200, { granted: true, bonus: 5 }]);
assert.deepEqual(await reward(7, D(1), HOLI), [200, { granted: true, bonus: 6 }]);
let v = await post("/verify", { license_key: "GAMEKEY1-AAAA-BBBB-CCCC", email: "g@example.com", product: "games" }, D(1));
assert.deepEqual(await v.json(), { valid: true, reason: "", kind: "games" });
v = await post("/verify", { license_key: "HOLIKEY1-AAAA-BBBB-CCCC", email: "h@example.com", product: "games" }, D(1));
assert.deepEqual(await v.json(), { valid: true, reason: "", kind: "holiday" });
// Without product games, /verify (the AI app's box) takes only a Holiday Pass, and a Games Pass gets no pass AI rounds.
v = await post("/verify", { license_key: "GAMEKEY1-AAAA-BBBB-CCCC", email: "g@example.com" }, D(1));
assert.deepEqual(await v.json(), { valid: false, reason: "not_found" });
r = await post("/", { n: 1 }, D(1), "9.9.9.9", GAME);
assert.equal(r.status, 402); assert.equal((await r.json()).error, "pass_invalid");
// Wrong email on a games key.
assert.deepEqual(await reward(8, D(1), { ...GAME, "x-pass-email": "x@example.com" }), [402, { granted: false, reason: "pass_invalid" }]);

// Spending: 2 free rounds today, then the bonus rounds (6 held), each still taking a global slot.
for (let i = 0; i < 2; i++) assert.equal((await ask(D(1))).status, 200);
r = await ask(D(1));
assert.equal(r.status, 200, "bonus round"); assert.equal(r.headers.get("x-bonus-left"), "5"); assert.equal(r.headers.get("x-trial-left"), "0");
const gd = () => sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'gd:%'").get().n;
assert.equal(gd(), 3, "bonus round took a global slot");
// A failed round hands the bonus and the global slot back.
fail = true;
assert.equal((await ask(D(1))).status, 429);
fail = false;
assert.equal(gd(), 3);
r = await ask(D(1)); assert.equal(r.headers.get("x-bonus-left"), "4");
// A device with no bonus still gets trial_used.
for (let i = 0; i < 2; i++) assert.equal((await ask(D(2))).status, 200);
r = await ask(D(2)); assert.equal(r.status, 402); assert.equal((await r.json()).error, "trial_used");
// Global cap full: a bonus can't skip it.
sql.prepare("UPDATE ai_use SET n = 40 WHERE k LIKE 'gd:%'").run();
r = await ask(D(1)); assert.equal(r.status, 429); assert.equal((await r.json()).error, "ai_busy");
assert.equal(sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'bonus:%' ORDER BY n DESC").get().n, 4, "bonus kept when busy");
sql.prepare("UPDATE ai_use SET n = 0 WHERE k LIKE 'gd:%'").run();

// At most BONUS_MAX held.
env.REWARD_DAILY = "50";
let last;
for (let L = 9; L <= 25; L++) last = await reward(L, D(1), GAME);
assert.equal(last[1].reason, "bonus_full"); assert.equal(last[1].bonus, 10);
// Everyone-together reward cap.
env.REWARD_GLOBAL_DAILY = String(sql.prepare("SELECT n FROM ai_use WHERE k LIKE 'rg:%' ORDER BY exp DESC").get().n);
assert.equal((await reward(1, D(3)))[1].reason, "busy");
// Turned off.
env.REWARDS = "off";
assert.deepEqual(await reward(1, D(4)), [200, { granted: false, reason: "off" }]);
// Nothing personal stored.
const rows = sql.prepare("SELECT k FROM ai_use").all().map(x => x.k).join(" ");
assert.ok(!/device|KEY1|example/.test(rows), rows);
console.log("reward ok");
