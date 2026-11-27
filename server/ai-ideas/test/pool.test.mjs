// Test the Worker's D1 idea pool with a real SQLite database (node:sqlite) standing in for D1.
// Run: node server/ai-ideas/test/pool.test.mjs   (Node 22 or newer)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync(dir + "/migrations/0001_idea_pool.sql", "utf8"));
const conv = s => s.replace(/\?(\d+)/g, "?$1");
const DB = {
  prepare(q) { const st = { q, args: [], bind(...a) { st.args = a; return st; }, run() { const p = sql.prepare(q); const named = {}; st.args.forEach((v, i) => named[String(i + 1)] = v); return p.run(...st.args.length && /\?\d/.test(q) ? [] : st.args, ...[]); } }; return st; },
  async batch(sts) { sql.exec("BEGIN"); try { for (const st of sts) { const p = sql.prepare(st.q); if (/\?\d/.test(st.q)) { const o = {}; st.args.forEach((v, i) => o["?" + (i + 1)] = v); p.run(o) } else p.run(...st.args) } sql.exec("COMMIT") } catch (e) { sql.exec("ROLLBACK"); throw e } }
};
const store = new Map();
const KV = { async get(k) { return store.get(k) ?? null }, async put(k, v) { store.set(k, v) } };
const ideasReply = [
  { title: "Drone repair kit", category: "Making", lo: 20, hi: 40, why: "Fix props and arms fast.", search: "drone repair kit" },
  { title: "Trombone slide oil", category: "Music", lo: 8, hi: 15, why: "Smooth slide for band.", search: "trombone slide oil" },
  { title: "Gift for Jove", category: "Other", lo: 10, hi: 20, why: "Jove would love it.", search: "jove gift" }
];
const AI = { async run() { return { response: JSON.stringify(ideasReply) } } };
const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const env = { AI, KV, DB, BETA_ONLY: "false", ALLOWED_ORIGINS: "https://shopmysticstudio.github.io" };
const req = (path, body) => new Request("https://w.example" + path, { method: "POST", headers: { Origin: "https://shopmysticstudio.github.io", "content-type": "application/json", "x-device-id": "abcdefghijklmnop1234" }, body: JSON.stringify(body) });
const payload = { n: 3, forWho: "them", ints: ["Making", "Music", "Not a real interest"], style: "Cozy", notes: "Jove builds drones", budget: "75", keptAi: [] };

let r = await worker.fetch(req("/", payload), env, ctx); await Promise.all(waits.splice(0));
console.log("round 1 status", r.status, (await r.json()).map(i => i.title));
r = await worker.fetch(req("/", { ...payload, keptAi: ["Drone repair kit"] }), env, ctx); await Promise.all(waits.splice(0));
r = await worker.fetch(req("/signal", { kept: ["trombone SLIDE oil"], top: ["Drone repair kit", "My own typed item"], cut: ["Trombone slide oil"] }), env, ctx); await Promise.all(waits.splice(0));
console.log("signal status", r.status);
console.log(sql.prepare("SELECT key,title,shown,kept,top,cut,lo_sum,hi_sum FROM ideas ORDER BY key").all());
console.log(sql.prepare("SELECT * FROM idea_tags ORDER BY key, tag").all());
console.log("KV pool keys (should be none):", [...store.keys()].filter(k => k.startsWith("pool:")));
console.log("anything personal stored?", JSON.stringify(sql.prepare("SELECT * FROM ideas").all()).match(/jove|abcdefghij/i));
// Without DB: falls back to KV
const env2 = { ...env, DB: undefined };
r = await worker.fetch(req("/", payload), env2, ctx); await Promise.all(waits.splice(0));
console.log("no-DB KV pool keys:", [...store.keys()].filter(k => k.startsWith("pool:")).length);
r = await worker.fetch(req("/signal", { kept: ["x"] }), env2, ctx);
console.log("no-DB signal", r.status);
