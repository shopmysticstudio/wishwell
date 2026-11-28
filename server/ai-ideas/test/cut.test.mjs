// Test that what people cut keeps out the same kind of thing, and what they keep and rank first
// is in the prompt. Run: node server/ai-ideas/test/cut.test.mjs
import assert from "node:assert/strict";
const dir = process.argv[2] || new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { closeness, parseIdeas, readPayload, buildMessages } = (await import(dir + "/worker.js")).default._test;
// Same kind of thing as a cut item: shares two real words, or the only word.
assert.ok(closeness("Logic puzzle book", ["Puzzle Book Collection"]) >= 2);
assert.ok(closeness("Crossword puzzle books", ["Puzzle Book Collection"]) >= 2);
assert.equal(closeness("Wooden puzzle box", ["Puzzle Book Collection"]), 0);
assert.equal(closeness("Mechanical puzzle cube", ["Puzzle Book Collection"]), 0);
assert.equal(closeness("Star projector", ["Moon Phase Desk Lamp"]), 0);
assert.ok(closeness("Lamp", ["Moon Phase Desk Lamp"]) >= 1);
const q = readPayload({ n: 6, budget: "any", kept: ["Moon Phase Desk Lamp", "3D Printer Filament Sampler"], top: ["Moon Phase Desk Lamp"],
  cut: ["Puzzle Book Collection"], seen: [] });
const out = JSON.stringify([
  { title: "Logic puzzle book", category: "Books", lo: 10, hi: 20, why: "x", search: "x" },
  { title: "Galaxy night light", category: "Room", lo: 20, hi: 40, why: "x", search: "x" },
  { title: "Moon phase wall lamp", category: "Room", lo: 20, hi: 40, why: "x", search: "x" },
  { title: "Wooden puzzle box", category: "Games", lo: 15, hi: 30, why: "x", search: "x" }]);
const ideas = parseIdeas(out, q);
assert.deepEqual(ideas.map(i => i.title), ["Galaxy night light", "Moon phase wall lamp", "Wooden puzzle box"]);
assert.equal(ideas.dropped.cut, 1);
// Close to a cut item but closer to a kept one: kept wins.
const q2 = readPayload({ n: 6, budget: "any", kept: ["Moon phase desk lamp"], cut: ["Desk lamp"], seen: [] });
assert.equal(parseIdeas(JSON.stringify([{ title: "Moon phase lamp", category: "Room", lo: 20, hi: 40 }]), q2).length, 1);
// The prompt names favorites and says cuts rule out the same kind of thing.
const msg = buildMessages(q)[1].content;
assert.match(msg, /Their favorites, at the top of their ranked list[^\n]*Moon Phase Desk Lamp/);
assert.match(msg, /about half of the ideas should be close cousins/);
assert.match(msg, /Never suggest the same kind of thing as a cut item/);
assert.match(buildMessages(readPayload({ n: 6 }))[1].content, /They kept \(want more like these\): nothing yet/);
assert.doesNotMatch(buildMessages(readPayload({ n: 6 }))[1].content, /Their favorites/);
console.log("all cut tests passed");
// Everyone's choices by kind of gift: smoothed, and only kinds with enough votes.
const { crowdCategories } = (await import(dir + "/worker.js")).default._test;
const rows = [["Science", 13, 2], ["Making", 10, 3], ["Tech", 15, 8], ["Food", 2, 13], ["Gaming", 1, 5], ["Music", 5, 9],
  ["Beauty", 0, 3], ["Art", 5, 10], ["Room", 10, 8], ["Books", 5, 3], ["Outdoors", 4, 2], ["Experiences", 4, 4]].map(([category, pos, neg]) => ({ category, pos, neg }));
const cc = crowdCategories(rows);
assert.deepEqual(cc, { catUp: ["Science", "Making"], catDown: ["Food", "Art"] });
assert.deepEqual(crowdCategories(rows.slice(0, 2)), { catUp: [], catDown: [] });   // too few votes overall
const m2 = buildMessages({ ...q, ...cc })[1].content;
assert.match(m2, /Across everyone so far, Science and Making gifts get kept more often, and Food and Art gifts get cut more often\. Use this only as a light tie breaker/);
console.log("crowd category tests passed");
