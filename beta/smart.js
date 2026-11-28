/* Wishwell beta: on-phone ranking.
   - Downloads the saved idea pool with its scores once (cached a few hours) and ranks it on the phone.
   - A small text model (ml/, MediaPipe Text Embedder) turns short texts into numbers, so typed interests
     match pool ideas by meaning, near repeats are dropped, and the next round is ready before it's asked for.
   - The AI stays the fallback: a round only skips the AI when the pool has enough good matches.
   - Reports anonymous findings (near repeats, words that matched nothing, which word picked which idea),
     only when sharing is on. Never Details text, names, or a device id.
   Beta only. Everything here reads the app's own state (S) and helpers from index.html. */
(() => {
"use strict";
const DBG = /[?&]smartdebug=1/.test(location.search);
if (DBG) { const d = document.createElement("pre"); d.id = "wwDebug"; d.textContent = "smart.js loaded";
  d.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99;background:#000c;color:#fff;font:11px monospace;padding:6px;border-radius:6px;max-width:96vw;white-space:pre-wrap;margin:0";
  document.body.appendChild(d); addEventListener("error", e => { window.__wwErr = (window.__wwErr || "") + "\nerror: " + e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno; d.textContent += window.__wwErr; }); }
const A = window.__WW;
if (!/\/beta\/($|index\.html)/.test(location.pathname) || !A) { if (DBG) document.getElementById("wwDebug").textContent += "\nstopped: path " + location.pathname + " app " + typeof A; return; }
// The app's own values and helpers (index.html shares them on window.__WW; S, qi and LOG_URL are read live).
const { AI_ON, CFG, $, BANK, INTS, STOP, stem, CATS, PAIRS, picks, byId, ageFit, GEN_RE, FEM_RE, MASC_RE, cutPenalty, maxB, addItem,
  logNames, logSafe, STEPS, fresh, save, show, render, toast, esc } = A;
const BASE = AI_ON ? String(CFG.aiUrl).trim().replace(/\/+$/, "") : "";
const code = () => window.WISHWELL_ACCESS_CODE || "";
const ML = new URL("ml/", location.href).href;
const POOL_KEY = "wishwell-beta-pool-v1", VEC_KEY = "wishwell-beta-vec-v1", PAST_KEY = "wishwell-beta-past-v1";
const POOL_HOURS = 6;
const TH = 0.42;        // a term and an idea this close count as a real match
const DUP = 0.86;       // this close is the same idea
const OWNED = 0.72;     // this close to something they already have: leave it out
const WEAK_MS = 60;     // one embedding slower than this: the phone is too slow, use server ranking
const W = { emb: null, embState: "", slow: false, pool: null, f: {}, seeds: {}, vec: new Map(), tvec: new Map(),
  found: { dups: [], gaps: new Set(), m: [] }, pre: null };
const POS = () => A.S.forWho === "me" ? "your" : "their";
const catCap = n => Math.max(2, Math.ceil(n / 4));
const wildCount = n => n >= 6 ? Math.floor(n / 6) : 0;
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 200));
const keyOf = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);

/* ---------- typed words, cleaned before matching ---------- */
// "Dunkin'", "dunkin donuts" and "Dunkin Donuts" all become "dunkin"; common typos and plurals are fixed.
const SYN = { "dunkin donuts": "dunkin", "dunkin'": "dunkin", "star bucks": "starbucks", "video games": "gaming",
  "videogames": "gaming", "vid games": "gaming", "legos": "lego", "tv shows": "shows", "t v": "tv", "k pop": "kpop",
  "k-pop": "kpop", "basket ball": "basketball", "foot ball": "football", "base ball": "baseball", "skate boarding": "skateboarding",
  "make up": "makeup", "work out": "workout", "working out": "workout", "the outdoors": "outdoors", "camp": "camping",
  "weather forecasting": "weather", "meteorology": "weather", "kitties": "cats", "kitty": "cats", "doggos": "dogs",
  "puppies": "dogs", "anime and manga": "anime manga", "true-crime": "true crime", "d&d": "dungeons and dragons", "dnd": "dungeons and dragons" };
const TYPO = { "puzzels": "puzzles", "puzles": "puzzles", "pokemon": "pokemon", "minecaft": "minecraft", "basketbal": "basketball",
  "soccor": "soccer", "footbal": "football", "gardning": "gardening", "photgraphy": "photography", "cookin": "cooking",
  "drawling": "drawing", "paintng": "painting", "readng": "reading", "fishin": "fishing", "huntin": "hunting", "musik": "music",
  "skincar": "skincare", "jewlery": "jewelry", "jewellery": "jewelry", "colour": "color", "favourite": "favorite", "theatre": "theater" };
function cleanText(t) {
  let s = " " + String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`]/g, "'").replace(/'s\b/g, "").replace(/'/g, "").replace(/[^a-z0-9&\- ]+/g, " ").replace(/\s+/g, " ") + " ";
  for (const [a, b] of Object.entries(SYN)) s = s.split(" " + a + " ").join(" " + b + " ");
  s = s.split(" ").map(w => TYPO[w] || w).join(" ");
  return s.trim();
}
// One more fix for a word one letter off from a word the pool knows (only for words of 5 letters or more).
let VOCAB = null;
function vocab() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set();
  const add = t => String(t).toLowerCase().split(/[^a-z]+/).forEach(w => { if (w.length >= 4) VOCAB.add(w); });
  (W.pool || []).forEach(p => add(p.t)); BANK.forEach(b => add(b[0] + " " + b[4])); INTS.forEach(i => add(i[0] + " " + i[1]));
  return VOCAB;
}
const off1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1; };
function fixWord(w) {
  if (w.length < 5) return w; const v = vocab(); if (v.has(w)) return w;
  for (const x of v) if (x[0] === w[0] && off1(w, x)) return x;
  return w;
}
const normalize = t => cleanText(t).split(" ").map(fixWord).join(" ");

/* ---------- the text model ---------- */
const unit = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Float32Array.from(v, x => x / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const pack = v => { const b = new Int8Array(v.length); v.forEach((x, i) => b[i] = Math.max(-127, Math.min(127, Math.round(x * 127)))); return btoa(String.fromCharCode(...new Uint8Array(b.buffer))); };
const unpack = s => { const u = Uint8Array.from(atob(s), c => c.charCodeAt(0)); return unit(Array.from(new Int8Array(u.buffer))); };
function loadEmbedder() {
  if (W.embState) return W.embP;
  const sd = navigator.connection && navigator.connection.saveData;
  if (sd || !window.WebAssembly) { W.embState = "off"; return W.embP = Promise.resolve(null); }
  W.embState = "loading";
  return W.embP = (async () => {
    try {
      const m = await import(ML + "text_bundle.mjs");
      const fs = await m.FilesetResolver.forTextTasks(ML + "wasm");
      const e = await m.TextEmbedder.createFromOptions(fs, { baseOptions: { modelAssetPath: ML + "use.tflite" }, l2Normalize: true });
      // The first call sets the model up and is always slow, so it isn't timed. Then the middle of three timed calls.
      e.embed("warm up");
      const ms = ["cozy reading nook blanket", "beginner telescope", "cat window perch"].map(t => { const t0 = performance.now(); e.embed(t); return performance.now() - t0; }).sort((a, b) => a - b)[1];
      W.ms = Math.round(ms);
      if (ms > WEAK_MS) { W.slow = true; W.embState = "slow"; return null; }
      W.emb = e; W.embState = "ready"; return e;
    } catch (err) { W.embState = "off"; return null; }
  })();
}
function vec(text) {
  const k = normalize(text); if (!k || !W.emb) return null;
  let v = W.tvec.get(k);
  if (!v) { try { v = unit(W.emb.embed(k).embeddings[0].floatEmbedding); } catch (e) { return null; } if (W.tvec.size > 400) W.tvec.clear(); W.tvec.set(k, v); }
  return v;
}
// Word overlap when the model isn't there, on the same 0 to 1 scale (roughly).
const words = t => new Set(normalize(t).split(" ").filter(x => x.length > 2 && !STOP.has(x)).map(stem));
function wsim(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n ? Math.min(0.9, 0.35 + 0.2 * n) : 0; }
function sim(a, b, va, vb) { if (va && vb) return dot(va, vb); return wsim(a, b); }

/* ---------- the pool ---------- */
async function loadPool() {
  if (W.pool) return W.pool;
  try { const c = JSON.parse(localStorage.getItem(POOL_KEY) || "null"); if (c && Date.now() - c.at < POOL_HOURS * 3600e3) { usePool(c); return W.pool; } } catch (e) {}
  if (!BASE || !code()) return null;
  try {
    const r = await fetch(BASE + "/pool", { method: "POST", headers: { "content-type": "application/json", "x-beta-code": code() }, body: "{}" });
    if (!r.ok) return null;
    const d = await r.json(); d.at = Date.now();
    try { localStorage.setItem(POOL_KEY, JSON.stringify(d)); } catch (e) {}
    usePool(d);
  } catch (e) { return null; }
  return W.pool;
}
function usePool(d) {
  W.pool = (d.pool || []).filter(p => p && p.t && CATS[p.c]).map(p => ({ ...p, b: [p.t, p.c, p.lo || 0, p.hi || 0, ((d.f[p.k] || {}).ints || p.ints || []).join(" ").toLowerCase(), ""] }));
  W.f = d.f || {}; W.seeds = d.seeds || {}; VOCAB = null;
}
// Pool vectors, saved on the phone, made in small steps while the phone is idle.
function poolVectors(done) {
  if (!W.emb || !W.pool) return done && done();
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(VEC_KEY) || "{}"); } catch (e) {}
  const todo = [];
  for (const p of W.pool) { if (W.vec.has(p.k)) continue; if (saved[p.k]) W.vec.set(p.k, unpack(saved[p.k])); else todo.push(p); }
  const step = () => {
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < 25) { const p = todo.shift(); const v = vec(p.t + ". " + p.c); if (v) { W.vec.set(p.k, v); saved[p.k] = pack(v); } }
    if (todo.length) return idle(step);
    try { localStorage.setItem(VEC_KEY, JSON.stringify(saved)); } catch (e) {}
    done && done();
  };
  step();
}

/* ---------- what we know about their taste ---------- */
const HAS_RE = /^(already )?(has|have|owns|own|got)\s+/;
function noteParts() {
  const parts = String(A.S.notes || "").split(/[,.;!?\n]|\band\b|\bor\b|\bbut\b|\bplus\b/i).map(x => x.trim()).filter(Boolean);
  const likes = [], owned = [];
  for (const raw of parts) {
    const low = raw.toLowerCase();
    if (/\b(18|19|[1-9]\d?)\b/.test(low) && low.replace(/[^a-z]/g, "").length < 4) continue;   // an age like "16"
    if (HAS_RE.test(low)) { owned.push(raw.replace(/^(already )?(has|have|owns|own|got)\s+/i, "").replace(/^(a|an|the|two|three|some|\d+)\s+/i, "")); continue; }
    const t = raw.replace(/^(she|he|they|i)\s+/i, "").replace(/^(really\s+)?(loves?|likes?|enjoys?|into|is into|wants?|obsessed with|a fan of|fan of|big)\s+/i, "").replace(/^(a|an|the)\s+/i, "").trim();
    if (t.length >= 3 && t.length <= 40) likes.push({ text: t, orig: raw });
  }
  return { likes, owned };
}
function ownedList() {
  const typed = String(A.S.owned || "").split(/[,;\n]|\band\b/).map(x => x.trim().replace(/^(a|an|the|two|three|\d+)\s+/i, "")).filter(x => x.length >= 2);
  return [...new Set([...typed, ...noteParts().owned])].slice(0, 20);
}
// Safe word to report: one plain word typed in lowercase; a capitalized word only as a hash (so only a
// known brand word is ever kept by the server, never a name).
async function safeTerm(orig) {
  const w = String(orig).trim();
  if (!/^[A-Za-z]{3,20}$/.test(w) || STOP.has(w.toLowerCase())) return "";
  if (/^[a-z]+$/.test(w)) return w;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wishwell-term:" + w.toLowerCase()));
  return "h:" + [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
// Each term: what to match (text), how much it counts (w), how to say it in a reason, and what to report.
function terms() {
  const t = [];
  A.S.ints.forEach(n => { const f = INTS.find(x => x[0] === n); t.push({ kind: "int", text: n + ": " + (f ? f[1] : ""), w: 1, label: n.toLowerCase(), rep: n.toLowerCase() }); });
  PAIRS.forEach(p => picks(p).forEach(o => t.push({ kind: "quiz", text: o[2], w: 0.8, label: o[1], rep: o[1].toLowerCase() })));
  noteParts().likes.forEach(l => t.push({ kind: "note", text: l.text, w: 1.25, label: l.text.toLowerCase(), orig: l.orig, one: /^[A-Za-z]+$/.test(l.text) ? l.text : "" }));
  A.S.kept.map(byId).filter(i => i && !i.mine).slice(0, 12).forEach((i, k) => t.push({ kind: "kept", text: i.title, w: k < 3 ? 1.35 : 1.1, label: i.title, rep: "kept", id: i.id }));
  (W.swipes || []).forEach(s => t.push({ kind: "swipe", text: s, w: 1.3, label: s, rep: "swipe" }));
  t.forEach(x => x.v = vec(x.text));
  return t;
}
const cutTerms = () => A.S.items.filter(i => i.status === "cut").slice(-30).map(i => ({ text: i.title, v: vec(i.title) }));

/* ---------- ranking a round ---------- */
function score(p, T, C, cutP) {
  const pv = W.vec.get(p.k) || null;
  let best = 0, second = 0, bt = null;
  for (const t of T) { const s = sim(p.t, t.text, pv, t.v) * t.w; if (s > best) { second = best; best = s; bt = t; } else if (s > second) second = s; }
  let cutS = 0; for (const c of C) cutS = Math.max(cutS, sim(p.t, c.text, pv, c.v));
  const f = W.f[p.k] || {};
  let s = best + 0.25 * second + 0.12 * (p.kept + 2 * p.top - p.cut) / (p.kept + p.top + p.cut + 4) + 0.03 * ageFit(p.b) - 0.04 * cutP(p.b);
  if (cutS > 0.6) s -= (cutS - 0.5) * 2;
  if (Array.isArray(f.age)) { if (A.S.age === "teen" && f.age[1] === 0) s -= 0.15; if (A.S.age && A.S.age !== "teen" && f.age[2] === 0) s -= 0.15; }
  return { p, s, best: bt ? best / bt.w : 0, t: bt, pv };
}
function allowed(p, mb, seen) {
  if (seen.has(p.t.toLowerCase()) || p.lo > mb || (A.S.budget === "9999" && p.hi < 150)) return false;
  const tx = (p.t + " " + p.b[4]).toLowerCase();
  if (GEN_RE.test(tx) && !((A.S.lean === "fem" && FEM_RE.test(tx)) || (A.S.lean === "masc" && MASC_RE.test(tx)))) return false;
  return true;
}
function why(t, p) {
  if (!t) return "";
  if (t.kind === "kept") return "Close to the " + t.label.toLowerCase().slice(0, 40) + " you circled";
  if (t.kind === "quiz") return "Picked for " + POS() + " " + t.label.toLowerCase() + " side";
  if (t.kind === "swipe") return "Fits what they liked when they swiped";
  if (t.kind === "seed") return "Often kept by people " + (A.S.age ? "this age" : "on this budget");
  return "Fits " + POS() + " love of " + t.label.slice(0, 40);
}
// Everything already on the list, and what they own, so near repeats are left out.
function shownTexts() { return A.S.items.map(i => ({ t: i.title, v: vec(i.title), src: i.src })); }
function nearRepeat(p, pv, shown, record) {
  for (const s of shown) { const x = sim(p.t, s.t, pv, s.v); if (x >= DUP) { if (record && s.src !== "Added by you") record.push([p.t, s.t, Math.round(x * 100)]); return true; } }
  return false;
}
function ownedHit(t, v, own) { for (const o of own) { const x = sim(t, o.t, v, o.v); if (x >= OWNED || (!v && wsim(t, o.t) >= 0.55)) return true; } return false; }

// Picks n ideas from the pool. Returns the picks and whether enough of them are real matches.
function rankRound(n) {
  const T = terms(); if (!W.pool) return { picks: [], confident: false };
  const C = cutTerms(), cutP = cutPenalty(), mb = maxB();
  const seen = new Set([...A.S.items.map(i => i.title.toLowerCase()), ...A.S.have.map(h => String(h).toLowerCase())]);
  const shown = shownTexts(), own = ownedList().map(t => ({ t, v: vec(t) }));
  // No taste yet: start from what people of the same age and budget kept most.
  const seedT = seedTerms();
  const TT = T.length ? T : seedT;
  const scored = W.pool.filter(p => allowed(p, mb, seen)).map(p => score(p, TT, C, cutP)).sort((a, b) => b.s - a.s);
  const picks = [], cats = {}, cap = catCap(n), wn = wildCount(n), dups = W.found.dups;
  const skip = { cap: 0, rep: 0, own: 0, ok: scored.length, all: W.pool.length };
  for (const x of scored) {
    if (picks.length >= n - wn) break;
    if ((cats[x.p.c] || 0) >= cap) { skip.cap++; continue; }
    if (nearRepeat(x.p, x.pv, shown, dups) || picks.some(y => sim(x.p.t, y.p.t, x.pv, y.pv) >= DUP)) { skip.rep++; continue; }
    if (own.length && ownedHit(x.p.t, x.pv, own)) { skip.own++; continue; }
    cats[x.p.c] = (cats[x.p.c] || 0) + 1; picks.push(x);
  }
  const good = picks.filter(x => x.best >= TH).length;
  // Wildcard: something well loved that nothing they said points to.
  if (wn) {
    const wild = scored.filter(x => x.best < 0.3 && x.p.kept + x.p.top >= 2 && x.p.kept + x.p.top > x.p.cut && !picks.includes(x) && (cats[x.p.c] || 0) < cap && !nearRepeat(x.p, x.pv, shown) && !(own.length && ownedHit(x.p.t, x.pv, own)))
      .sort((a, b) => (b.p.kept + 2 * b.p.top) - (a.p.kept + 2 * a.p.top))[0];
    if (wild) { wild.wild = true; picks.splice(Math.min(3, picks.length), 0, wild); }
  }
  // Budget bundles: under $25 or $75, two small ideas that go together become one gift.
  if (A.S.budget === "25" || A.S.budget === "75") {
    const lim = +A.S.budget, small = scored.filter(x => x.p.hi && x.p.hi <= lim * 0.6 && !picks.includes(x) && x.best >= TH * 0.8).slice(0, 40);
    let bundle = null;
    for (let i = 0; i < small.length && !bundle; i++) for (let j = i + 1; j < small.length; j++) {
      const a = small[i], b = small[j], s = sim(a.p.t, b.p.t, a.pv, b.pv);
      if (s >= 0.35 && s < 0.8 && a.p.hi + b.p.hi <= lim && a.p.c !== "Other") { bundle = { a, b }; break; }
    }
    if (bundle && picks.length >= n - wn) {
      const { a, b } = bundle; picks.pop();
      picks.push({ bundle: true, p: { k: a.p.k + "+" + b.p.k, t: (a.p.t + " plus " + b.p.t.charAt(0).toLowerCase() + b.p.t.slice(1)).slice(0, 78), c: a.p.c, lo: a.p.lo + b.p.lo, hi: a.p.hi + b.p.hi }, t: a.t, best: a.best });
    }
  }
  W.skip = skip;
  return { picks, confident: good >= Math.min(n - wn, 6) || (!T.length && seedT.length > 0 && picks.length >= n - wn), T, seed: !T.length };
}
function seedTerms() {
  const s = W.seeds || {}, rows = s[(A.S.age || "") + "|" + (A.S.budget || "")] || s[(A.S.age || "") + "|"] || s["|" + (A.S.budget || "")] || [];
  return rows.slice(0, 8).map(r => ({ kind: "seed", text: r[0], w: 1, label: r[0], rep: "seed", v: vec(r[0]) }));
}
function addPicks(picks, round) {
  let c = 0;
  for (const x of picks) {
    const p = x.p;
    const it = addItem({ title: p.t, cat: p.c, lo: p.lo, hi: p.hi, why: x.wild ? "Something new to try, loved by other people" : x.bundle ? "Two small gifts that go together, inside the budget" : why(x.t, p), src: "Starter idea" });
    it.round = round; it.pool = 1; if (x.wild) it.wild = 1; if (x.t && x.t.kind === "seed") it.seed = 1;
    if (x.t && x.t.kind === "kept") it.bc = x.t.label;
    it.mt = x.wild ? "" : x.t ? (x.t.rep || (x.t.kind === "note" ? (x.t.one || "details") : "")) : "";
    c++;
  }
  return c;
}

/* ---------- words that matched nothing (for the leftover-AI job) ---------- */
async function noteGaps(T) {
  if (!W.pool) return;
  for (const t of T) {
    if (t.kind !== "note" && t.kind !== "int") continue;
    let best = 0;
    for (const p of W.pool) { best = Math.max(best, sim(p.t, t.text, W.vec.get(p.k), t.v)); if (best >= 0.35) break; }
    if (best >= 0.35) continue;
    if (t.kind === "int") { W.found.gaps.add(t.rep); continue; }
    for (const w of String(t.orig || t.text).split(/\s+/).slice(0, 4)) { const s = await safeTerm(w.replace(/[^A-Za-z]/g, "")); if (s) W.found.gaps.add(s); }
  }
}

/* ---------- "Because you kept..." for every idea, AI ones too ---------- */
function labelBecause(round) {
  const kept = A.S.kept.map(byId).filter(i => i && !i.mine && (i.round || 0) < round).slice(0, 15).map(i => ({ t: i.title, v: vec(i.title) }));
  if (!kept.length) return;
  A.S.items.filter(i => (i.round || 0) === round && i.status === "new" && !i.bc && !i.mine).forEach(i => {
    const v = vec(i.title); let best = 0, bt = null;
    for (const k of kept) { const s = sim(i.title, k.t, v, k.v); if (s > best) { best = s; bt = k; } }
    if (bt && best >= (v ? 0.5 : 0.55) && best < DUP) i.bc = bt.t;
  });
}
// After an AI round: drop near repeats of earlier ideas and things they already have.
function cleanRound(round) {
  const own = ownedList().map(t => ({ t, v: vec(t) }));
  const older = A.S.items.filter(i => (i.round || 0) !== round).map(i => ({ t: i.title, v: vec(i.title), src: i.src }));
  const mine = A.S.items.filter(i => (i.round || 0) === round && i.status === "new" && !i.mine);
  const keep = [];
  for (const i of mine) {
    const v = vec(i.title);
    const rep = older.find(o => sim(i.title, o.t, v, o.v) >= DUP) || keep.find(o => sim(i.title, o.t, v, o.v) >= DUP);
    if (rep) { if (rep.src !== "Added by you") W.found.dups.push([i.title, rep.t, Math.round(sim(i.title, rep.t, v, rep.v) * 100)]); A.S.items = A.S.items.filter(x => x !== i); continue; }
    if (own.length && ownedHit(i.title, v, own)) { A.S.items = A.S.items.filter(x => x !== i); continue; }
    keep.push({ t: i.title, v });
  }
}

/* ---------- server ranking for phones too slow for the model ---------- */
async function serverRank(n) {
  if (!BASE || !code()) return [];
  const kept = A.S.kept.map(byId).filter(Boolean).map(i => i.title), cut = A.S.items.filter(i => i.status === "cut").map(i => i.title);
  try {
    const r = await fetch(BASE + "/rank", { method: "POST", headers: { "content-type": "application/json", "x-beta-code": code() },
      body: JSON.stringify({ n, age: A.S.age || "", ints: A.S.ints, quiz: PAIRS.flatMap(p => picks(p).map(o => o[2])), budget: A.S.budget, kept, cut, seen: [...A.S.items.map(i => i.title), ...A.S.have].slice(-120) }) });
    if (!r.ok) return [];
    return ((await r.json()).ideas || []).map(i => ({ p: { k: keyOf(i.title), t: i.title, c: CATS[i.category] ? i.category : "Other", lo: i.lo, hi: i.hi }, t: null, best: 0 }));
  } catch (e) { return []; }
}

/* ---------- findings back to the server (only with sharing on) ---------- */
function report() {
  if (!BASE || !code() || typeof A.LOG_URL === "undefined" || !A.LOG_URL) return;
  const m = [];
  A.S.items.forEach(i => { if (!i.pool || !i.mt || i.mts) return; if ((i.round || 0) >= (A.S.round || 0) && i.status === "new") return;
    const k = A.S.kept.indexOf(i.id), o = i.status === "kept" ? (k >= 0 && k < 3 ? "top" : "kept") : i.status === "cut" ? "cut" : "none";
    m.push([i.mt, i.title, o]); i.mts = 1; });
  const body = { dups: W.found.dups.splice(0, 20), gaps: [...W.found.gaps].slice(0, 10), m: m.slice(0, 40) };
  W.found.gaps.clear();
  if (!body.dups.length && !body.gaps.length && !body.m.length) return;
  const nms = logNames(); body.dups = body.dups.filter(d => logSafe(d[0], nms) && logSafe(d[1], nms));
  try { fetch(BASE + "/findings", { method: "POST", keepalive: true, headers: { "content-type": "application/json", "x-beta-code": code() }, body: JSON.stringify(body) }).catch(() => {}); } catch (e) {}
}
addEventListener("pagehide", report);

/* ---------- smarter quiz: ask next the question that splits the ideas best ---------- */
function orderQuiz() {
  const id = STEPS[A.qi]; if (!PAIRS.some(p => p.id === id)) return;
  const rest = []; for (let j = A.qi + 1; j < STEPS.length; j++) if (PAIRS.some(p => p.id === STEPS[j])) rest.push(j);
  if (rest.length < 2) return;
  const answered = PAIRS.filter(p => A.S.quiz[p.id] != null && A.S.quiz[p.id] >= 0).flatMap(picks);
  const items = (W.pool && W.pool.length ? W.pool.map(p => ({ t: p.t, w: words(p.t + " " + p.b[4]), v: W.vec.get(p.k) })) : BANK.map(b => ({ t: b[0], w: words(b[0] + " " + b[4]), v: null })));
  const hit = (it, o) => { const ov = vec(o[2]); if (ov && it.v) return dot(ov, it.v) >= 0.3; const ow = words(o[2]); for (const x of ow) if (it.w.has(x)) return true; return false; };
  const live = answered.length ? items.filter(it => answered.some(o => hit(it, o))) : items;
  const cand = live.length >= 20 ? live : items;
  let bj = rest[0], bv = -1;
  for (const j of rest) {
    const p = PAIRS.find(x => x.id === STEPS[j]);
    let a = 0, b = 0; for (const it of cand) { if (hit(it, p.o[0])) a++; if (hit(it, p.o[1])) b++; }
    const v = Math.min(a, b) + 0.1 * (a + b);
    if (v > bv) { bv = v; bj = j; }
  }
  if (bj !== A.qi + 1) { const [s] = STEPS.splice(bj, 1); STEPS.splice(A.qi + 1, 0, s); }
}

/* ---------- past lists, kept on the phone ---------- */
function pastLists() { try { return JSON.parse(localStorage.getItem(PAST_KEY) || "[]"); } catch (e) { return []; } }
function archive() {
  const kept = A.S.items.filter(i => i.status === "kept" || i.status === "have" || i.mine);
  if (!kept.length) return;
  const snap = JSON.parse(JSON.stringify(A.S)); delete snap.past;
  const list = pastLists().filter(x => x.lid !== A.S.lid);
  list.unshift({ lid: A.S.lid || "", at: Date.now(), name: A.S.listName || A.S.name || "", n: kept.length, top: A.S.kept.map(byId).filter(Boolean).slice(0, 3).map(i => i.title), s: snap });
  try { localStorage.setItem(PAST_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { try { localStorage.setItem(PAST_KEY, JSON.stringify(list.slice(0, 3))); } catch (x) {} }
}
function openPast(k) {
  const list = pastLists(), x = list[k]; if (!x) return;
  archive();
  const keep = { ageOk: A.S.ageOk, u13: A.S.u13, m: A.S.m, trialUsed: A.S.trialUsed, trialUntil: A.S.trialUntil, trialFree: A.S.trialFree, aiRounds: A.S.aiRounds };
  Object.keys(A.S).forEach(key => delete A.S[key]); Object.assign(A.S, fresh(), x.s, keep);
  save(); show("ideas"); render(); toast("Opened " + (x.name || "your earlier list"));
}
function pastPanel() {
  const list = pastLists(); if (!list.length) { toast("No past lists on this phone yet"); return; }
  const o = document.createElement("div"); o.className = "wwpast"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Past lists");
  o.innerHTML = `<div class="wwbox"><h2>Past lists</h2><p class="small muted">Saved on this phone only.</p>${list.map((x, k) => `<button type="button" class="btn wide" data-k="${k}" style="margin:6px 0;text-align:left;display:block">${esc(x.name || "List")} · ${x.n} kept · ${esc(new Date(x.at).toLocaleDateString())}<br><small class="muted">${esc(x.top.join(", "))}</small></button>`).join("")}<button type="button" class="btn quiet" data-x="1">Close</button></div>`;
  o.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) { o.remove(); openPast(+b.dataset.k); } else if (e.target.closest("[data-x]") || e.target === o) o.remove(); });
  document.body.appendChild(o);
}

/* ---------- swipe link: the person it's for swipes ideas; the giver's list tunes to them ---------- */
async function makeSwipe() {
  if (!BASE || !code()) return toast("Swipe links need the beta code");
  if (A.S.forWho !== "them") return toast("Swipe links are for lists you make for someone else");
  await loadPool();
  const kept = A.S.kept.map(byId).filter(i => i && !i.mine).slice(0, 8);
  const nms = logNames();
  const own = kept.map(i => ({ t: i.title, c: i.cat }));
  const others = (W.pool || []).filter(p => !own.some(o => o.t.toLowerCase() === p.t.toLowerCase()) && p.lo <= maxB()).sort(() => Math.random() - 0.5).slice(0, 20 - own.length).map(p => ({ t: p.t, c: p.c }));
  const deck = [...own, ...others].filter(c => logSafe(c.t, nms)).sort(() => Math.random() - 0.5).slice(0, 20);
  if (deck.length < 5) return toast("Circle a few ideas first");
  try {
    const r = await fetch(BASE + "/swipe/new", { method: "POST", headers: { "content-type": "application/json", "x-beta-code": code() }, body: JSON.stringify({ deck }) });
    const d = await r.json(); if (!d.id) throw 0;
    A.S.swipe = { id: d.id, deck: deck.map(c => c.t), at: Date.now() }; save();
    const url = new URL("swipe/#" + d.id, location.href).href;
    const text = "Help me pick gift ideas? Swipe through a few, it takes a minute: " + url;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) {} }
    try { await navigator.clipboard.writeText(text); toast("Swipe link copied. Send it to them."); } catch (e) { prompt("Copy this link and send it to them:", url); }
  } catch (e) { toast("Couldn't make the swipe link just now"); }
}
// Their likes become taste (which card they liked is never shown); passes go on as quiet cuts.
async function checkSwipe() {
  const sw = A.S.swipe; if (!sw || sw.got || !BASE || !code() || Date.now() - sw.at > 14 * 864e5) return;
  try {
    const r = await fetch(BASE + "/swipe/votes", { method: "POST", headers: { "content-type": "application/json", "x-beta-code": code() }, body: JSON.stringify({ id: sw.id }) });
    const d = await r.json(); if (!d.votes) return;
    sw.got = 1; A.S.swipeLiked = sw.deck.filter((t, i) => d.votes[i] === 1); A.S.swipePassed = sw.deck.filter((t, i) => d.votes[i] === 0);
    W.swipes = A.S.swipeLiked; save();
    // New ideas still on the screen move to fit their taste, so the list changes without saying what they liked.
    resortNew(); render(); toast("Their swipes are in. New ideas now lean their way.");
  } catch (e) {}
}
function resortNew() {
  const T = terms(); if (!T.length) return;
  const items = A.S.items.filter(i => i.status === "new" && !i.mine && (i.round || 0) === (A.S.round || 0));
  const val = i => { const v = vec(i.title); let b = 0; for (const t of T) b = Math.max(b, sim(i.title, t.text, v, t.v) * t.w); return b; };
  const ords = items.map(i => i.ord ?? i.no).sort((a, b) => a - b);
  items.sort((a, b) => val(b) - val(a)).forEach((i, k) => i.ord = ords[k]);
}

/* ---------- the round, called from getIdeas ---------- */
async function round(n, opt) {
  opt = opt || {};
  await loadPool();
  if (!W.pool || !W.pool.length) return { got: 0 };
  if (W.embState === "loading") await Promise.race([W.embP, new Promise(r => setTimeout(r, opt.force ? 400 : 2500))]);
  if (W.emb && W.vec.size < W.pool.length) await new Promise(r => poolVectors(r));
  if (!W.emb && (W.slow || W.embState === "off")) {
    // Slow phone or no model: the server ranks the pool instead (no AI).
    if (!opt.force) return { got: 0 };
    const p = await serverRank(n); return { got: addPicks(p, A.S.round || 0) };
  }
  const r = rankRound(n);
  if (r.T) await noteGaps(r.T);
  W.last = "round " + (A.S.round || 0) + ": " + r.picks.length + " picks, " + r.picks.filter(x => x.best >= TH).length + " good, top " + r.picks.slice(0, 3).map(x => x.p.t + " " + x.best.toFixed(2)).join("; ") + (r.confident ? "" : " (AI)") + " " + JSON.stringify(W.skip || {});
  if (!r.confident && !opt.force) return { got: 0, why: "few_matches" };
  return { got: addPicks(r.picks.slice(0, n), A.S.round || 0) };
}
function after(round) { if (W.emb) cleanRound(round); labelBecause(round); const sb = $("#wwSwipe"); if (sb) sb.hidden = A.S.forWho !== "them"; idle(prep); }
// Next round ready early: vectors for anything new on the list and their latest taste.
function prep() { if (!W.emb) return; A.S.items.slice(-40).forEach(i => vec(i.title)); terms(); }

/* ---------- start up ---------- */
// The access code is checked a moment after the page loads (and later if they type it at the gate), so wait for it.
function start(tries) {
  if (!code()) { tries = (tries || 0) + 1; if (tries < 600) setTimeout(() => start(tries), 500); return; }
  W.swipes = A.S.swipeLiked || [];
  idle(async () => { await loadPool(); await loadEmbedder(); poolVectors(); checkSwipe(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkSwipe(); else report(); });
  // Buttons: past lists and the swipe link, beside More ideas.
  const more = $("#moreBtn");
  if (more && !$("#wwSwipe")) {
    const sb = document.createElement("button"); sb.type = "button"; sb.className = "btn"; sb.id = "wwSwipe"; sb.textContent = "Let them swipe";
    sb.hidden = A.S.forWho !== "them"; sb.addEventListener("click", makeSwipe); more.parentNode.appendChild(sb);
  }
  const rt = $("#retake");
  if (rt && !$("#wwPast")) { const pb = document.createElement("button"); pb.type = "button"; pb.className = "btn quiet"; pb.id = "wwPast"; pb.textContent = "Past lists"; pb.addEventListener("click", pastPanel); rt.parentNode.appendChild(pb); }
  const css = document.createElement("style");
  css.textContent = ".wwpast{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:60}.wwpast .wwbox{background:var(--paper,#fff);color:inherit;border-radius:16px;padding:18px;max-width:480px;width:92%;max-height:80vh;overflow:auto}";
  document.head.appendChild(css);
}

window.WWSmart = {
  on: () => !!(code() && BASE),
  round, after, report, orderQuiz, archive, checkSwipe, makeSwipe, state: () => ({ emb: W.embState, pool: W.pool ? W.pool.length : 0, vec: W.vec.size, slow: W.slow }),
  owned: ownedList, _test: { normalize, cleanText, noteParts, rankRound, terms, sim, vec, W }
};
try { start(); } catch (e) { if (DBG) document.getElementById("wwDebug").textContent += (window.__wwErr = "\nstart failed: " + e.message); }
// ?smartdebug=1 shows what the matcher is doing, for testing.
if (DBG) {
  const d = document.getElementById("wwDebug");
  setInterval(() => { const st = WWSmart.state(); d.textContent = "matcher " + st.emb + (W.ms != null ? " " + W.ms + "ms" : "") + " · pool " + st.pool + " · vectors " + st.vec + (st.slow ? " · slow" : "") + (W.last ? "\n" + W.last : "") + (window.__wwErr || ""); }, 1000);
}
})();
