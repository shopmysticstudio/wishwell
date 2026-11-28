// Beta round rules: 1 wildcard in every 6 ideas, a cap per category, no band or show names from the
// details, and the keep rate view. The live app (no beta code) keeps the old rules.
// Run: node server/ai-ideas/test/beta.test.mjs   (Node 22 or newer)
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const worker = (await import(dir + "/worker.js")).default;
const { wildCount, catCap, properNames, buildMessages, parseIdeas, readPayload } = worker._test;

assert.equal(wildCount(5), 0); assert.equal(wildCount(6), 1); assert.equal(wildCount(10), 1); assert.equal(wildCount(12), 2);
assert.equal(catCap(8), 2); assert.equal(catCap(10), 3);
assert.deepEqual([...properNames("Loves Paramore and Shinedown. Cats are her thing, plus Dunkin on Mondays")].sort(), ["dunkin", "paramore", "shinedown"]);
assert.deepEqual([...properNames("Loves weather, cats and easy puzzles")], []);

const q = (extra, beta) => Object.assign(readPayload({ n: 6, forWho: "them", budget: "any", ints: ["Music"], ...extra }), { beta });
// Prompt: only beta asks for a wildcard and bans band names.
assert.match(buildMessages(q({}, true))[1].content, /Exactly 1 of the ideas is a wildcard/);
assert.match(buildMessages(q({}, true))[1].content, /band, singer, artist/);
assert.doesNotMatch(buildMessages(q({}, false))[1].content, /wildcard|band, singer/);

const idea = (title, category, wild) => ({ title, category, lo: 10, hi: 20, why: "x", search: title, ...(wild ? { wild: true } : {}) });
const reply = items => ({ response: JSON.stringify(items) });
const items = [
  idea("Record display frame", "Music"), idea("Paramore vinyl record", "Music"), idea("Turntable cleaning kit", "Music"),
  idea("Vinyl storage crate", "Music"), idea("Concert poster frame", "Music"), idea("Pottery wheel kit", "Making", true),
  idea("Terrarium kit", "Making", true), idea("Guitar pick punch", "Making"), idea("Desk speaker", "Tech")];
// Beta: Paramore dropped as a name, Music capped at 2 (n 6), one wildcard placed fourth.
let ideas = parseIdeas(reply(items), q({ notes: "Loves Paramore" }, true));
assert.equal(ideas.length, 6);
assert.ok(!ideas.some(i => /Paramore/.test(i.title)));
assert.equal(ideas.dropped.brand, 1);
assert.equal(ideas.filter(i => i.wild).length, 1);
assert.equal(ideas[3].title, "Pottery wheel kit");
assert.ok(ideas.filter(i => i.category === "Music").length <= 3, "spares fill in only when short");
// Short round: capped ideas come back in so the round still has n ideas.
ideas = parseIdeas(reply(items.slice(0, 5)), q({}, true));
assert.equal(ideas.length, 5);
// Live: same as before, no wildcard flag, no cap, names pass the filter.
ideas = parseIdeas(reply(items), q({ notes: "Loves Paramore" }, false));
assert.deepEqual(ideas.map(i => i.title), items.slice(0, 6).map(i => i.title));
assert.ok(!ideas.some(i => i.wild));

// Keep rate view: per round number and source, lists with at least one touched idea only.
const sql = new DatabaseSync(":memory:");
for (const f of readdirSync(dir + "/migrations").sort()) sql.exec(readFileSync(dir + "/migrations/" + f, "utf8"));
const addRound = (lid, r, outs, src = "ai") => {
  sql.prepare("INSERT INTO rounds (list_id, round, day, hour, surface, source) VALUES (?,?,?,?,?,?)").run(lid, r, "2026-11-28", 9, "beta", "ai");
  outs.forEach((o, p) => sql.prepare("INSERT INTO round_ideas (list_id, round, pos, idea_key, title, category, src, outcome) VALUES (?,?,?,?,?,?,?,?)").run(lid, r, p, "k" + p, "T" + p, "Other", src, o));
};
addRound("a", 1, ["kept", "cut", "none", "none"]);
addRound("a", 3, ["top", "kept", "none", "cut"]);
addRound("b", 1, ["none", "none", "none", "none"]);   // never touched: left out
addRound("c", 1, ["none", "kept"], "wild");
const rows = sql.prepare("SELECT * FROM keep_rate ORDER BY round, src").all().map(r => ({ ...r }));
const row = (r, s) => rows.find(x => x.round === r && x.src === s);
assert.equal(row(1, "all").shown, 6); assert.equal(row(1, "all").keep_rate, 0.333);
assert.equal(row(1, "ai").keep_rate, 0.25); assert.equal(row(1, "wild").keep_rate, 0.5);
assert.equal(row(3, "all").keep_rate, 0.5); assert.equal(row(3, "all").lists, 1);
console.log("beta ok");
