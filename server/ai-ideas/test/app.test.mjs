// Test the Android app's origin: only /verify and Holiday Pass rounds, never the free trial or other routes.
// Run: node server/ai-ideas/test/app.test.mjs   (Node 22 or newer). Gumroad is faked.
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const AI = { async run() { return { response: JSON.stringify([{ title: "Cozy throw blanket", category: "Room", lo: 20, hi: 40, why: "Warm nights in", search: "throw blanket" }]) } } };
globalThis.fetch = async (url, init) => {
  const b = new URLSearchParams(init.body);
  const ok = b.get("license_key") === "GOODKEY1-AAAA-BBBB-CCCC";
  return new Response(JSON.stringify(ok ? { success: true, uses: 1, purchase: { email: "buyer@example.com", refunded: false, chargebacked: false, disputed: false } } : { success: false }));
};
const env = { AI, KV, BETA_ONLY: "false", BACKUP_MODEL: "off", GUMROAD_PRODUCT_ID: "P", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost" };
const ctx = { waitUntil() {} };
const call = (path, origin, extra, method = "POST", body = { n: 1 }) => worker.fetch(new Request("https://w.example" + path, { method, body: method === "POST" ? JSON.stringify(body) : undefined,
  headers: { Origin: origin, "content-type": "application/json", "x-device-id": "deviceAPP000000000001", "CF-Connecting-IP": "7.7.7.7", ...(extra || {}) } }), env, ctx);
const APP = "https://localhost", PASS = { "x-pass-key": "GOODKEY1-AAAA-BBBB-CCCC", "x-pass-email": "buyer@example.com" };

// Preflight for /verify and / works from the app, with CORS for the pass headers.
let r = await call("/verify", APP, null, "OPTIONS");
assert.equal(r.status, 204); assert.equal(r.headers.get("Access-Control-Allow-Origin"), APP);
assert.match(r.headers.get("Access-Control-Allow-Headers"), /x-pass-email/);
assert.equal((await call("/", APP, null, "OPTIONS")).status, 204);
assert.equal((await call("/photo", APP, null, "OPTIONS")).status, 403);
// /verify and pass rounds work.
r = await call("/verify", APP, null, "POST", { license_key: "GOODKEY1-AAAA-BBBB-CCCC", email: "buyer@example.com" });
assert.deepEqual([r.status, await r.json()], [200, { valid: true, reason: "" }]);
r = await call("/", APP, PASS); assert.equal(r.status, 200); assert.equal(r.headers.get("Access-Control-Allow-Origin"), APP);
// A wrong key from the app gets pass_invalid, not a free trial round.
r = await call("/", APP, { "x-pass-key": "NOPE", "x-pass-email": "buyer@example.com" }); assert.equal(r.status, 402); assert.equal((await r.json()).error, "pass_invalid");
// No key: no free trial, and no other routes, from the app.
assert.equal((await call("/signal", APP, null, "OPTIONS")).status, 204);
assert.equal((await call("/signal", APP, null, "POST", { kept: ["Cozy throw blanket"] })).status, 204);
for (const p of ["/", "/photo", "/waitlist"]) assert.equal((await call(p, APP)).status, 403, p);
// Other origins are still refused; the website still gets its free trial.
assert.equal((await call("/", "https://evil.example", PASS)).status, 403);
assert.equal((await call("/", "http://localhost", PASS)).status, 403);
assert.equal((await call("/", "https://shopmysticstudio.github.io")).status, 200);
console.log("app origin tests passed");
