// Test Holiday Pass keys: key plus purchase email, 3 devices, wrong-try limit, daily and weekly caps.
// Run: node server/ai-ideas/test/pass.test.mjs   (Node 22 or newer). Gumroad is faked.
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const AI = { async run() { return { response: JSON.stringify([{ title: "Cozy throw blanket " + Math.random(), category: "Room", lo: 20, hi: 40, why: "Warm nights in", search: "throw blanket" }]) } } };
const SALES = { "GOODKEY1-AAAA-BBBB-CCCC": { email: "Buyer@Example.com" }, "REFUNDED-AAAA-BBBB-CCCC": { email: "r@example.com", refunded: true } };
let gumroadCalls = 0;
globalThis.fetch = async (url, init) => {
  gumroadCalls++;
  assert.match(String(url), /api\.gumroad\.com\/v2\/licenses\/verify/);
  const b = new URLSearchParams(init.body);
  assert.equal(b.get("product_id"), "PRODUCT-ID");
  const s = SALES[b.get("license_key")];
  return new Response(JSON.stringify(s ? { success: true, uses: 1, purchase: { email: s.email, refunded: !!s.refunded, chargebacked: false, disputed: false } } : { success: false, message: "That license does not exist" }));
};
const env = { AI, KV, BETA_ONLY: "false", BACKUP_MODEL: "off", GUMROAD_PRODUCT_ID: "PRODUCT-ID", PASS_DAILY: "3", PASS_WEEKLY: "5", PASS_DEVICES: "3", PASS_BAD_TRIES: "4",
  ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const ctx = { waitUntil() {} };
const H = (dev, ip, extra) => ({ Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": dev, "CF-Connecting-IP": ip, ...(extra || {}) });
const verify = async (key, email, dev, ip) => { const r = await worker.fetch(new Request("https://w.example/verify", { method: "POST", body: JSON.stringify({ license_key: key, email }), headers: H(dev, ip) }), env, ctx); return [r.status, await r.json()]; };
const round = (key, email, dev, ip) => worker.fetch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ n: 1 }), headers: H(dev, ip, { "x-pass-key": key, "x-pass-email": email }) }), env, ctx);
const D = i => "devicePASS0000000000" + i;

// Key plus the purchase email (any case, extra spaces) unlocks.
assert.deepEqual(await verify("GOODKEY1-AAAA-BBBB-CCCC", "  buyer@example.COM ", D(1), "1.1.1.1"), [200, { valid: true, reason: "" }]);
// Right key, wrong email: same answer as an unknown key.
assert.deepEqual(await verify("GOODKEY1-AAAA-BBBB-CCCC", "someone@else.com", D(1), "2.2.2.2"), [200, { valid: false, reason: "not_found" }]);
assert.deepEqual(await verify("NOPEKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(1), "2.2.2.2"), [200, { valid: false, reason: "not_found" }]);
// No email: refused without asking Gumroad or counting a wrong try.
const before = gumroadCalls;
assert.deepEqual(await verify("GOODKEY1-AAAA-BBBB-CCCC", "", D(1), "2.2.2.2"), [200, { valid: false, reason: "missing_email" }]);
assert.equal(gumroadCalls, before);
// Refunded sale.
assert.deepEqual(await verify("REFUNDED-AAAA-BBBB-CCCC", "r@example.com", D(1), "2.2.2.2"), [200, { valid: false, reason: "refunded" }]);
// 4 wrong tries from one network: the next try is refused, even the right one; other networks are fine.
assert.equal((await verify("NOPEKEY2-AAAA-BBBB-CCCC", "x@y.com", D(1), "2.2.2.2"))[1].valid, false);
assert.deepEqual(await verify("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(1), "2.2.2.2"), [429, { error: "too_many_tries" }]);
assert.equal((await verify("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(2), "3.3.3.3"))[1].valid, true);
// 3 devices: the 4th is refused; a device already on the list still works.
assert.equal((await verify("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(3), "3.3.3.3"))[1].valid, true);
assert.deepEqual(await verify("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(4), "3.3.3.3"), [200, { valid: false, reason: "device_limit" }]);
assert.equal((await verify("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(2), "3.3.3.3"))[1].valid, true);
// AI rounds with the key: 3 a day shared by all devices, then pass_daily_limit.
const calls = gumroadCalls;
for (let i = 0; i < 3; i++) { const r = await round("GOODKEY1-AAAA-BBBB-CCCC", "Buyer@example.com", D(1 + (i % 3)), "4.4.4.4"); assert.equal(r.status, 200, "round " + i); assert.equal(r.headers.get("x-pass-left"), String(2 - i)); }
assert.equal(gumroadCalls, calls, "rounds use the cached check, not Gumroad");
let r = await round("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(1), "4.4.4.4");
assert.equal(r.status, 429); assert.equal((await r.json()).error, "pass_daily_limit");
// Wrong email on a round, 4th device on a round, missing device id.
assert.equal((await round("GOODKEY1-AAAA-BBBB-CCCC", "other@example.com", D(1), "5.5.5.5")).status, 402);
assert.equal((await round("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(4), "5.5.5.5")).status, 403);
assert.equal((await round("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", "", "5.5.5.5")).status, 403);
// Weekly cap: pretend 5 rounds were used this week.
for (const k of store.keys()) if (k.startsWith("passweek:")) store.set(k, "5");
for (const k of store.keys()) if (k.startsWith("passday:")) store.set(k, "0");
r = await round("GOODKEY1-AAAA-BBBB-CCCC", "buyer@example.com", D(1), "6.6.6.6");
assert.equal(r.status, 429); assert.equal((await r.json()).error, "pass_weekly_limit");
// Nothing readable is stored: no key, email or device id.
const dump = [...store.entries()].flat().join(" ");
assert.ok(!/GOODKEY|buyer|example\.com|devicePASS/i.test(dump), dump);
console.log("all pass tests passed");
