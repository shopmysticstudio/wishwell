// Test the website page counter (/hit) with a real SQLite database (node:sqlite) standing in for D1.
// Run: node server/ai-ideas/test/hit.test.mjs   (Node 22 or newer)
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const stmt = q => { const st = { args: [], bind(...a) { st.args = a; return st; },
  async run() { return /\?\d/.test(q) ? sql.prepare(q).run(named(st.args)) : sql.prepare(q).run(...st.args); } }; return st; };
let perMinuteCalls = 0, hitsLeft = 1000;
const env = { DB: { prepare: stmt }, ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost",
  PER_MINUTE: { async limit() { perMinuteCalls++; return { success: true }; } },
  HITS: { async limit() { return { success: hitsLeft-- > 0 }; } } };
const pending = [];
const ctx = { waitUntil(p) { pending.push(p); } };
const hit = async (body, origin = "https://shopmysticstudio.github.io", ip = "1.1.1.1") => {
  const r = await worker.fetch(new Request("https://w.example/hit", { method: "POST", body: JSON.stringify(body),
    headers: { Origin: origin, "content-type": "text/plain;charset=UTF-8", "CF-Connecting-IP": ip } }), env, ctx);
  await Promise.all(pending.splice(0)); return r.status;
};
// First hit creates the table; views add up per day, page, referrer and device.
assert.equal(await hit({ p: "/", r: "www.Instagram.com", d: "phone" }), 204);
assert.equal(await hit({ p: "/", r: "instagram.com", d: "phone" }), 204);
await hit({ p: "/beta/home/", r: "", d: "desktop" });
await hit({ p: "/app/", e: "try_free", r: "should-be-dropped.com", d: "phone" });
await hit({ p: "/secret/path?x=1", d: "tablet" });                    // unknown page and device
await hit({ p: "/", r: "javascript:alert(1)", d: "phone" });            // junk referrer
await hit({ p: "/", e: "hack_event" });                                 // unknown event: dropped
await hit({ p: "/beta/home/", e: "waitlist_signup", d: "desktop" });
const rows = sql.prepare("SELECT page, event, ref, dev, n FROM analytics ORDER BY page, event, ref, dev").all().map(r => ({ ...r }));
assert.deepEqual(rows, [
  { page: "/", event: "view", ref: "", dev: "phone", n: 1 },
  { page: "/", event: "view", ref: "instagram.com", dev: "phone", n: 2 },
  { page: "/app/", event: "try_free", ref: "", dev: "phone", n: 1 },
  { page: "/beta/home/", event: "view", ref: "", dev: "desktop", n: 1 },
  { page: "/beta/home/", event: "waitlist_signup", ref: "", dev: "desktop", n: 1 },
  { page: "other", event: "view", ref: "", dev: "desktop", n: 1 }]);
assert.deepEqual(Object.keys(sql.prepare("SELECT * FROM analytics LIMIT 1").get()), ["day", "page", "event", "ref", "dev", "n"]);
assert.match(sql.prepare("SELECT day FROM analytics LIMIT 1").get().day, /^\d{4}-\d{2}-\d{2}$/);
// Page views never use the AI rounds' per-minute limit.
assert.equal(perMinuteCalls, 0);
// Other sites and the Android app can't count.
const before = sql.prepare("SELECT SUM(n) s FROM analytics").get().s;
assert.equal(await hit({ p: "/" }, "https://evil.example"), 403);
assert.equal(await hit({ p: "/" }, "https://localhost"), 403);
// Past the per-network limit, hits are quietly dropped.
hitsLeft = 0; assert.equal(await hit({ p: "/" }), 204);
assert.equal(sql.prepare("SELECT SUM(n) s FROM analytics").get().s, before);
console.log("all hit tests passed");
