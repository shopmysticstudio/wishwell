// Test the anonymous round log (/log) with node:sqlite standing in for D1.
// Run: node server/ai-ideas/test/log.test.mjs   (Node 22 or newer)
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
const named = args => { const o = {}; args.forEach((v, i) => o["?" + (i + 1)] = v); return o; };
const stmt = q => { const st = { args: [], bind(...a) { st.args = a; return st; }, async run() { return sql.prepare(q).run(named(st.args)); } }; return st; };
let hitsLeft = 1000;
const env = { DB: { prepare: stmt }, ALLOWED_ORIGINS: "https://shopmysticstudio.github.io", APP_ORIGINS: "https://localhost",
  HITS: { async limit() { return { success: hitsLeft-- > 0 }; } } };
const pending = [];
const ctx = { waitUntil(p) { pending.push(p); } };
const log = async (body, origin = "https://shopmysticstudio.github.io") => {
  const r = await worker.fetch(new Request("https://w.example/log", { method: "POST", body: JSON.stringify(body),
    headers: { Origin: origin, "content-type": "text/plain;charset=UTF-8", "CF-Connecting-IP": "1.1.1.1" } }), env, ctx);
  await Promise.all(pending.splice(0)); return r.status;
};
const lid = "a".repeat(32);
// A round: quiz answers and ideas shown; Details text, names and junk are dropped.
assert.equal(await log({ lid, r: 1, s: "beta", src: "mixed", ctx: { fw: "them", age: "teen", lean: "zzz", style: "Cozy", budget: "75",
  ints: ["Tech", "Not real", "Gaming"], quiz: ["sat2=1", "ears=2", "bad quiz", "x=9"], det: true, notes: "Sam loves trains", name: "Sam" },
  ideas: [{ p: 0, t: "Moon phase desk lamp", c: "Room", src: "ai", lo: 20, hi: 40 }, { p: 1, t: "Puzzle book collection", c: "Books", src: "starter", lo: 10, hi: 20 },
    { p: 2, t: "Nike running shoes", c: "Style", src: "ai" }, { p: 99, t: "Too far", c: "Room" }] }), 204);
const r = { ...sql.prepare("SELECT * FROM rounds").get() };
assert.equal(r.list_id, lid); assert.equal(r.surface, "beta"); assert.equal(r.for_who, "them"); assert.equal(r.lean, ""); assert.equal(r.style, "Cozy");
assert.deepEqual(JSON.parse(r.ints), ["Tech", "Gaming"]); assert.deepEqual(JSON.parse(r.quiz), ["sat2=1", "ears=2"]); assert.equal(r.has_details, 1);
assert.ok(r.hour >= 0 && r.hour < 24 && /^\d{4}-\d{2}-\d{2}$/.test(r.day));
assert.ok(!JSON.stringify(r).includes("Sam") && !JSON.stringify(r).includes("trains"));
assert.deepEqual(sql.prepare("SELECT pos, title, src, outcome FROM round_ideas ORDER BY pos").all().map(x => ({ ...x })), [
  { pos: 0, title: "Moon phase desk lamp", src: "ai", outcome: "none" }, { pos: 1, title: "Puzzle book collection", src: "starter", outcome: "none" }]);
// Outcomes change as they change their mind.
await log({ lid, out: [[1, 0, "kept", 2], [1, 1, "cut", 0]] });
await log({ lid, out: [[1, 0, "top", 1], [1, 5, "kept", 1], [1, 1, "bogus", 0]] });
assert.deepEqual(sql.prepare("SELECT pos, outcome, rank FROM round_ideas ORDER BY pos").all().map(x => ({ ...x })), [
  { pos: 0, outcome: "top", rank: 1 }, { pos: 1, outcome: "cut", rank: 0 }]);
// A live "more like this" idea joins the same round; resending the round changes nothing else.
await log({ lid, r: 1, s: "beta", src: "mixed", ctx: { fw: "me" }, ideas: [{ p: 2, t: "Beginner telescope", c: "Science", src: "rec", lo: 60, hi: 120 }] });
assert.equal(sql.prepare("SELECT for_who FROM rounds").get().for_who, "them");
assert.equal(sql.prepare("SELECT src FROM round_ideas WHERE pos = 2").get().src, "rec");
// The Android app may log too; other sites and bad ids may not.
assert.equal(await log({ lid: "b".repeat(32), r: 1, s: "app", src: "ai", ctx: {}, ideas: [{ p: 0, t: "Star map print", c: "Room", src: "ai" }] }, "https://localhost"), 204);
assert.equal(sql.prepare("SELECT surface FROM rounds WHERE list_id = ?1").get({ "?1": "b".repeat(32) }).surface, "app");
assert.equal(await log({ lid, r: 2, ideas: [{ p: 0, t: "x y" }] }, "https://evil.example"), 403);
await log({ lid: "not-hex", r: 1, ideas: [{ p: 0, t: "Lamp", c: "Room" }] });
assert.equal(sql.prepare("SELECT COUNT(*) c FROM rounds").get().c, 2);
// Past the per-network limit, quietly dropped.
hitsLeft = 0; await log({ lid: "c".repeat(32), r: 1, ideas: [{ p: 0, t: "Lamp", c: "Room" }] });
assert.equal(sql.prepare("SELECT COUNT(*) c FROM rounds").get().c, 2);
console.log("all log tests passed");
