/* Wishwell Holiday Games
   25 levels up a Christmas tree, each one a tiny holiday game. Beat a level (1 star or more) to open the next.
   Levels 1 to 4 are free; the rest need the Games Pass (a Gumroad license key, checked by the Wishwell AI service).
   A level's first win can earn a bonus AI round, granted by the AI service (never by the browser), capped per day.
   Plain HTML, CSS and canvas JavaScript, no ads, no tracking. Scores stay on the device (localStorage).
   Music and sounds are synthesized live with Web Audio from an original tune written for Wishwell.

   To reuse it somewhere else, copy advent.css and advent.js, add <div id="advent"></div>, then:
     WishwellAdvent.mount(el, {backHref: "../", backLabel: "Wishwell", showPreview: false,
       net: {url: "<AI service address>", buyUrl: "<Games Pass checkout link>", price: "$1.99"}});
   Without net.url the free levels still play; the pass box and bonus rounds are hidden.
   Testing helper in the address: ?preview=1 opens every level (no bonus rounds while it's on). */
(function () {
"use strict";

const W = 360, H = 540, TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const C = { navy: "#23284d", gold: "#ffc94a", coral: "#e0453a", teal: "#2a9d8f", cream: "#fff6e5", pine: "#2f6b4f", plum: "#8e5bb0", sky: "#5fa8de", pink: "#f28dac", ink: "#2b2340" };
const ORN = [C.coral, C.gold, C.teal, C.plum, C.sky, C.pink];
const INK = C.ink;
const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------- Saved on this device ---------- */
const KEY = "wishwell-levels-v1";
const S = { best: {}, plays: {}, rew: {}, sound: true, music: true, preview: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

/* ---------- Sound: original jingle + effects, made with Web Audio ---------- */
const Snd = (function () {
  let ac = null, master, mus, fx, noise, timer = null, nextT = 0, step = 0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function ensure() {
    if (ac) { if (ac.state === "suspended" && !document.hidden) ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {} // follows the phone's silent switch where supported
    try { ac = new AC(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = S.sound ? 0.9 : 0; master.connect(ac.destination);
    mus = ac.createGain(); mus.gain.value = 0.3; mus.connect(master);
    fx = ac.createGain(); fx.gain.value = 0.7; fx.connect(master);
    const len = Math.floor(ac.sampleRate * 0.5); noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, vol, dest, a, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, a || 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + (a || 0.005) + dur + 0.05);
  }
  function bell(f, t, dur, vol, dest) { osc("sine", f, t, dur, vol, dest, 0.004); osc("sine", f * 2.76, t, dur * 0.45, vol * 0.2, dest, 0.002); osc("triangle", f * 2, t, dur * 0.3, vol * 0.1, dest, 0.002); }
  function hiss(t, dur, vol, dest, freq, type) {
    const s = ac.createBufferSource(); s.buffer = noise; const fl = ac.createBiquadFilter(); fl.type = type || "highpass"; fl.frequency.value = freq || 7000;
    const g = ac.createGain(); env(g, t, 0.003, vol, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05); return fl;
  }
  // "Wishwell Snow Day": an original 8 bar tune in C major, in eighth notes [midi note, length]
  const MEL = [[67,2],[72,1],[76,1],[79,2],[76,1],[72,1], [69,2],[72,1],[76,1],[81,3],[79,1], [77,1],[76,1],[74,1],[72,1],[69,2],[72,2], [74,2],[71,1],[67,1],[74,2],[0,2],
               [76,1],[76,1],[79,2],[76,1],[74,1],[72,2], [69,1],[71,1],[72,2],[76,2],[81,2], [77,2],[81,1],[77,1],[79,2],[71,1],[74,1], [72,3],[67,1],[72,4]];
  const SEQ = []; (function () { let s = 0; for (const n of MEL) { SEQ[s] = n; s += n[1]; } })();
  const ROOTS = [48, 45, 41, 43, 48, 45, 41, 48];
  const CH = { 48: [60, 64, 67], 45: [57, 60, 64], 41: [57, 60, 65], 43: [55, 59, 62] };
  const STEP = 60 / 138 / 2;
  function schedStep(s, t) {
    const bar = Math.floor(s / 8), b = s % 8; let root = ROOTS[bar]; if (bar === 6 && b >= 4) root = 43;
    const m = SEQ[s]; if (m && m[0]) bell(mtof(m[0]), t, Math.min(0.9, STEP * m[1] * 1.6), 0.2, mus);
    if (b === 0) osc("sine", mtof(root), t, STEP * 3, 0.34, mus, 0.01);
    if (b === 4) osc("sine", mtof(root + 7), t, STEP * 3, 0.26, mus, 0.01);
    if (b === 2 || b === 6) for (const n of CH[root]) osc("triangle", mtof(n), t, STEP * 0.9, 0.04, mus, 0.01);
    hiss(t, 0.05, b % 2 ? 0.025 : 0.055, mus, 8000);
  }
  function tick() {
    if (!ac || ac.state !== "running") return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.18) { schedStep(step, nextT); step = (step + 1) % 64; nextT += STEP; }
  }
  function startMusic() { if (!S.music || !S.sound || timer || !ensure()) return; nextT = ac.currentTime + 0.08; timer = setInterval(tick, 40); }
  function stopMusic() { clearInterval(timer); timer = null; }
  const FX = {
    ding(n) { const t = ac.currentTime; bell(mtof(84 + [0, 2, 4, 7, 9, 12, 14, 16][Math.min(n || 0, 7)]), t, 0.35, 0.32, fx); },
    gold() { const t = ac.currentTime; [84, 88, 91, 96].forEach((m, i) => bell(mtof(m), t + i * 0.06, 0.4, 0.28, fx)); },
    bad() { const t = ac.currentTime; osc("square", 170, t, 0.22, 0.12, fx, 0.005, 60); hiss(t, 0.12, 0.1, fx, 600, "lowpass"); },
    miss() { osc("triangle", 330, ac.currentTime, 0.25, 0.2, fx, 0.005, 160); },
    pop(n) { const t = ac.currentTime, k = Math.min(n || 0, 14); osc("sine", 480 + k * 45, t, 0.13, 0.28, fx, 0.002, 1100 + k * 70); },
    jump() { osc("triangle", 330, ac.currentTime, 0.15, 0.22, fx, 0.003, 680); },
    flap() { const t = ac.currentTime; hiss(t, 0.08, 0.16, fx, 1500, "bandpass"); osc("sine", 520, t, 0.08, 0.08, fx, 0.002, 760); },
    thud() { osc("sine", 230, ac.currentTime, 0.12, 0.32, fx, 0.002, 90); },
    whoosh() { const t = ac.currentTime, f = hiss(t, 0.35, 0.2, fx, 400, "bandpass"); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.3); },
    tok() { osc("sine", 420, ac.currentTime, 0.07, 0.25, fx, 0.002, 300); },
    win() { const t = ac.currentTime; [72, 76, 79, 84].forEach((m, i) => bell(mtof(m), t + i * 0.09, 0.5, 0.28, fx)); },
    over() { const t = ac.currentTime; [79, 76, 72, 67].forEach((m, i) => bell(mtof(m), t + i * 0.13, 0.6, 0.25, fx)); },
    sparkle() { const t = ac.currentTime; for (let i = 0; i < 6; i++) bell(mtof(96 + ri(0, 7)), t + i * 0.05, 0.3, 0.1, fx); },
    perfect(n) { const t = ac.currentTime, b = 72 + Math.min(n || 0, 12); bell(mtof(b), t, 0.4, 0.28, fx); bell(mtof(b + 7), t + 0.05, 0.4, 0.18, fx); }
  };
  return {
    ensure, startMusic, stopMusic,
    play(name, arg) { if (!S.sound || !ensure() || ac.state !== "running") return; try { FX[name] && FX[name](arg); } catch (e) {} },
    setSound(on) { S.sound = on; save(); if (on) { if (ensure()) master.gain.setTargetAtTime(0.9, ac.currentTime, 0.02); startMusic(); } else { if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.02); stopMusic(); } },
    setMusic(on) { S.music = on; save(); if (on) startMusic(); else stopMusic(); },
    suspend() { if (ac && ac.state === "running") ac.suspend(); },
    resume() { if (ac && ac.state === "suspended") ac.resume(); }
  };
})();

/* ---------- Drawing kit (storybook outlines) ---------- */
function rr(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fs(g, fill, lw) { g.fillStyle = fill; g.fill(); if (lw !== 0) { g.lineWidth = lw || 2.5; g.strokeStyle = INK; g.stroke(); } }
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function dot(g, x, y, r, col) { circ(g, x, y, r); g.fillStyle = col; g.fill(); }
function text(g, s, x, y, size, col, align, outline) {
  g.font = "900 " + size + "px Nunito, system-ui, sans-serif"; g.textAlign = align || "center"; g.textBaseline = "middle";
  if (outline) { g.lineWidth = Math.max(3, size / 6); g.strokeStyle = outline; g.lineJoin = "round"; g.strokeText(s, x, y); }
  g.fillStyle = col; g.fillText(s, x, y);
}
const D = {
  present(g, x, y, w, h, col, rib) {
    g.lineWidth = 2; g.strokeStyle = INK; g.fillStyle = rib;
    g.beginPath(); g.ellipse(x - w * 0.17, y - h / 2 - h * 0.1, w * 0.17, h * 0.12, -0.5, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x + w * 0.17, y - h / 2 - h * 0.1, w * 0.17, h * 0.12, 0.5, 0, TAU); g.fill(); g.stroke();
    rr(g, x - w / 2, y - h / 2, w, h, 4); fs(g, col);
    g.fillStyle = rib; g.fillRect(x - w * 0.09, y - h / 2 + 1.5, w * 0.18, h - 3); g.fillRect(x - w / 2 + 1.5, y - h * 0.09, w - 3, h * 0.18);
    circ(g, x, y - h / 2 - h * 0.03, w * 0.08); fs(g, rib, 2);
  },
  ornament(g, x, y, r, col) {
    rr(g, x - r * 0.28, y - r * 1.22, r * 0.56, r * 0.34, 2); fs(g, "#d9b45a", 1.8);
    circ(g, x, y, r); fs(g, col);
    g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.38, r * 0.26, r * 0.15, -0.7, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = r * 0.13; g.beginPath(); g.arc(x, y, r * 0.62, 0.35, 1.15); g.stroke();
  },
  coal(g, x, y, r) {
    g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, q = r * (0.82 + 0.22 * Math.sin(i * 2.3)); g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); fs(g, "#3b3a44"); dot(g, x - r * 0.3, y - r * 0.3, r * 0.15, "rgba(255,255,255,.3)");
  },
  flake(g, x, y, r, rot, col) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.strokeStyle = col || "#fff"; g.lineWidth = Math.max(1.6, r * 0.15); g.lineCap = "round";
    for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.moveTo(0, -r * 0.55); g.lineTo(-r * 0.27, -r * 0.8); g.moveTo(0, -r * 0.55); g.lineTo(r * 0.27, -r * 0.8); g.stroke(); }
    g.restore();
  },
  icicle(g, x, y, w, h) {
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.lineTo(x, y + h); g.closePath(); fs(g, "#bfe8fb", 2);
    g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.moveTo(x - w * 0.3, y + 2); g.lineTo(x - w * 0.08, y + 2); g.lineTo(x - w * 0.12, y + h * 0.55); g.closePath(); g.fill();
  },
  ginger(g, x, y, s) {
    const c = "#b8733d";
    const shape = (lw, col) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = "round"; g.lineWidth = s * 0.3 + lw;
      g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.1); g.lineTo(x + s * 0.5, y - s * 0.1); g.moveTo(x - s * 0.15, y + s * 0.12); g.lineTo(x - s * 0.33, y + s * 0.6); g.moveTo(x + s * 0.15, y + s * 0.12); g.lineTo(x + s * 0.33, y + s * 0.6); g.stroke();
      g.beginPath(); g.ellipse(x, y + s * 0.05, s * 0.29 + lw / 2, s * 0.35 + lw / 2, 0, 0, TAU); g.fill(); circ(g, x, y - s * 0.48, s * 0.26 + lw / 2); g.fill();
    };
    shape(5, INK); shape(0, c);
    dot(g, x - s * 0.09, y - s * 0.52, s * 0.045, INK); dot(g, x + s * 0.09, y - s * 0.52, s * 0.045, INK);
    g.strokeStyle = "#fff"; g.lineWidth = Math.max(1.5, s * 0.05); g.lineCap = "round"; g.beginPath(); g.arc(x, y - s * 0.46, s * 0.11, 0.35, Math.PI - 0.35); g.stroke();
    dot(g, x, y - s * 0.05, s * 0.055, C.coral); dot(g, x, y + s * 0.13, s * 0.055, C.teal);
    g.beginPath(); for (const [ax, ay] of [[-0.42, -0.1], [0.42, -0.1], [-0.29, 0.5], [0.29, 0.5]]) { g.moveTo(x + ax * s - s * 0.07, y + ay * s - s * 0.05); g.lineTo(x + ax * s, y + ay * s + s * 0.05); g.lineTo(x + ax * s + s * 0.07, y + ay * s - s * 0.05); } g.stroke();
  },
  cookie(g, x, y, r, burnt) {
    circ(g, x, y, r); fs(g, burnt ? "#4a3226" : "#e0a95f");
    if (!burnt) { for (const [a, b] of [[-.35, -.3], [.3, -.22], [0, .25], [-.32, .3], [.36, .32], [.05, -.02]]) dot(g, x + a * r, y + b * r, r * 0.11, "#5a3a24"); }
    else { dot(g, x + r * 0.2, y - r * 1.25, r * 0.25, "rgba(160,160,170,.6)"); dot(g, x - r * 0.12, y - r * 1.65, r * 0.18, "rgba(160,160,170,.5)"); dot(g, x - r * 0.3, y - r * 0.2, r * 0.12, "#2a1c15"); }
  },
  penguin(g, x, y, s, wave) { // x,y = bottom center
    const w = s * 0.8, h = s;
    for (const d of [-1, 1]) { g.beginPath(); g.ellipse(x + d * w * 0.18, y - h * 0.03, w * 0.17, h * 0.055, 0, 0, TAU); fs(g, "#f29b38", 1.8); }
    for (const d of [-1, 1]) { g.save(); g.translate(x + d * w * 0.46, y - h * 0.5); g.rotate(d * (0.35 + (wave || 0))); g.beginPath(); g.ellipse(0, h * 0.12, w * 0.12, h * 0.22, 0, 0, TAU); fs(g, "#2d3456", 2); g.restore(); }
    g.beginPath(); g.ellipse(x, y - h * 0.5, w * 0.48, h * 0.48, 0, 0, TAU); fs(g, "#2d3456");
    g.beginPath(); g.ellipse(x, y - h * 0.4, w * 0.33, h * 0.34, 0, 0, TAU); g.fillStyle = "#fff"; g.fill();
    dot(g, x - w * 0.13, y - h * 0.72, s * 0.05, "#fff"); dot(g, x + w * 0.13, y - h * 0.72, s * 0.05, "#fff");
    dot(g, x - w * 0.12, y - h * 0.715, s * 0.03, INK); dot(g, x + w * 0.14, y - h * 0.715, s * 0.03, INK);
    g.beginPath(); g.moveTo(x - w * 0.09, y - h * 0.63); g.lineTo(x + w * 0.09, y - h * 0.63); g.lineTo(x, y - h * 0.54); g.closePath(); fs(g, "#f29b38", 1.5);
    rr(g, x - w * 0.4, y - h * 0.55, w * 0.8, h * 0.09, 4); fs(g, C.coral, 1.5);
    dot(g, x - w * 0.24, y - h * 0.6, s * 0.05, "rgba(242,141,172,.6)"); dot(g, x + w * 0.24, y - h * 0.6, s * 0.05, "rgba(242,141,172,.6)");
  },
  snowman(g, x, y, s) { // bottom center
    circ(g, x, y - s * 0.3, s * 0.3); fs(g, "#fff"); circ(g, x, y - s * 0.78, s * 0.22); fs(g, "#fff");
    rr(g, x - s * 0.2, y - s * 0.62, s * 0.4, s * 0.08, 3); fs(g, C.teal, 1.5);
    rr(g, x - s * 0.17, y - s * 1.12, s * 0.34, s * 0.22, 3); fs(g, "#2d3456", 2); rr(g, x - s * 0.26, y - s * 0.93, s * 0.52, s * 0.06, 2); fs(g, "#2d3456", 2);
    dot(g, x - s * 0.08, y - s * 0.82, s * 0.03, INK); dot(g, x + s * 0.08, y - s * 0.82, s * 0.03, INK);
    g.beginPath(); g.moveTo(x, y - s * 0.78); g.lineTo(x + s * 0.2, y - s * 0.74); g.lineTo(x, y - s * 0.72); g.closePath(); fs(g, "#f29b38", 1.2);
    dot(g, x, y - s * 0.38, s * 0.035, INK); dot(g, x, y - s * 0.24, s * 0.035, INK);
  },
  elf(g, x, y, s) { // face center
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + d * s * 0.3, y - s * 0.08); g.lineTo(x + d * s * 0.62, y - s * 0.24); g.lineTo(x + d * s * 0.32, y + s * 0.12); g.closePath(); fs(g, "#f5c9a0", 2); }
    circ(g, x, y, s * 0.36); fs(g, "#f5c9a0");
    g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.14); g.lineTo(x + s * 0.42, y - s * 0.14); g.lineTo(x + s * 0.3, y - s * 0.98); g.closePath(); fs(g, "#3d9a5e");
    rr(g, x - s * 0.46, y - s * 0.24, s * 0.92, s * 0.14, 5); fs(g, "#fff", 2); circ(g, x + s * 0.3, y - s * 0.98, s * 0.1); fs(g, "#fff", 2);
    dot(g, x - s * 0.12, y + s * 0.02, s * 0.045, INK); dot(g, x + s * 0.12, y + s * 0.02, s * 0.045, INK);
    dot(g, x - s * 0.22, y + s * 0.14, s * 0.06, "rgba(242,120,140,.5)"); dot(g, x + s * 0.22, y + s * 0.14, s * 0.06, "rgba(242,120,140,.5)");
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(x, y + s * 0.1, s * 0.1, 0.4, Math.PI - 0.4); g.stroke();
  },
  sleigh(g, x, y, s) {
    g.lineCap = "round"; g.strokeStyle = INK; g.lineWidth = 5;
    const run = () => { g.beginPath(); g.moveTo(x - s * 0.55, y + s * 0.34); g.lineTo(x + s * 0.42, y + s * 0.34); g.quadraticCurveTo(x + s * 0.66, y + s * 0.34, x + s * 0.6, y + s * 0.14); g.stroke(); };
    run(); g.strokeStyle = C.gold; g.lineWidth = 2.5; run();
    g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.18, s * 0.27, s * 0.27, 0, 0, TAU); fs(g, "#c9925a");
    D.present(g, x + s * 0.08, y - s * 0.22, s * 0.26, s * 0.22, C.teal, C.gold);
    g.beginPath(); g.moveTo(x - s * 0.56, y - s * 0.02); g.lineTo(x + s * 0.24, y - s * 0.02); g.quadraticCurveTo(x + s * 0.52, y - s * 0.04, x + s * 0.5, y - s * 0.34);
    g.quadraticCurveTo(x + s * 0.68, y - s * 0.28, x + s * 0.62, y + s * 0.06); g.quadraticCurveTo(x + s * 0.56, y + s * 0.26, x + s * 0.3, y + s * 0.26);
    g.lineTo(x - s * 0.48, y + s * 0.26); g.quadraticCurveTo(x - s * 0.62, y + s * 0.12, x - s * 0.56, y - s * 0.02); g.closePath(); fs(g, C.coral);
    g.strokeStyle = C.gold; g.lineWidth = 2; g.beginPath(); g.moveTo(x - s * 0.5, y + s * 0.06); g.lineTo(x + s * 0.4, y + s * 0.06); g.stroke();
  },
  robin(g, x, y, s, ph) {
    g.beginPath(); g.moveTo(x - s * 0.35, y); g.lineTo(x - s * 0.7, y - s * 0.12); g.lineTo(x - s * 0.66, y + s * 0.12); g.closePath(); fs(g, "#7a5036", 2);
    circ(g, x, y, s * 0.42); fs(g, "#9a6a45");
    g.beginPath(); g.ellipse(x + s * 0.1, y + s * 0.12, s * 0.26, s * 0.24, 0, 0, TAU); g.fillStyle = "#ef6f3c"; g.fill();
    g.save(); g.translate(x - s * 0.08, y - s * 0.02); g.rotate(Math.sin(ph || 0) * 0.7 - 0.2); g.beginPath(); g.ellipse(-s * 0.12, -s * 0.06, s * 0.26, s * 0.14, -0.3, 0, TAU); fs(g, "#7a5036", 2); g.restore();
    dot(g, x + s * 0.2, y - s * 0.14, s * 0.07, "#fff"); dot(g, x + s * 0.22, y - s * 0.14, s * 0.045, INK);
    g.beginPath(); g.moveTo(x + s * 0.38, y - s * 0.08); g.lineTo(x + s * 0.58, y - s * 0.02); g.lineTo(x + s * 0.38, y + s * 0.04); g.closePath(); fs(g, "#f2b52e", 1.5);
    circ(g, x - s * 0.02, y - s * 0.44, s * 0.08); fs(g, C.coral, 1.5); // tiny hat pompom
  },
  reindeer(g, x, y, s, ph, fly) { // body center
    g.lineCap = "round";
    const legs = (col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (const [lx, o] of [[-0.28, 0], [-0.14, 1.6], [0.2, 3.1], [0.32, 4.7]]) { const a = fly ? 0.9 + Math.sin(ph + o) * 0.2 : Math.sin(ph + o) * 0.6; g.moveTo(x + lx * s, y + s * 0.12); g.lineTo(x + lx * s - Math.sin(a) * s * 0.34, y + s * 0.12 + Math.cos(a) * s * 0.34); }
      g.stroke(); };
    legs(INK, 8); legs("#8a5a33", 4.5);
    g.beginPath(); g.ellipse(x, y, s * 0.42, s * 0.24, 0, 0, TAU); fs(g, "#a0683c");
    g.beginPath(); g.moveTo(x + s * 0.26, y - s * 0.1); g.lineTo(x + s * 0.42, y - s * 0.42); g.lineTo(x + s * 0.54, y - s * 0.34); g.lineTo(x + s * 0.4, y - s * 0.02); g.closePath(); fs(g, "#a0683c");
    g.strokeStyle = "#6b4423"; g.lineWidth = 3; g.beginPath();
    g.moveTo(x + s * 0.44, y - s * 0.6); g.lineTo(x + s * 0.36, y - s * 0.86); g.moveTo(x + s * 0.4, y - s * 0.74); g.lineTo(x + s * 0.26, y - s * 0.8);
    g.moveTo(x + s * 0.52, y - s * 0.6); g.lineTo(x + s * 0.62, y - s * 0.86); g.moveTo(x + s * 0.58, y - s * 0.75); g.lineTo(x + s * 0.72, y - s * 0.8); g.stroke();
    g.beginPath(); g.ellipse(x + s * 0.54, y - s * 0.52, s * 0.18, s * 0.14, 0.3, 0, TAU); fs(g, "#b07445");
    dot(g, x + s * 0.54, y - s * 0.56, s * 0.035, INK); circ(g, x + s * 0.7, y - s * 0.46, s * 0.07); fs(g, C.coral, 1.5);
    g.beginPath(); g.ellipse(x - s * 0.4, y - s * 0.12, s * 0.07, s * 0.05, -0.5, 0, TAU); g.fillStyle = "#fff"; g.fill();
    rr(g, x + s * 0.28, y - s * 0.24, s * 0.22, s * 0.08, 3); fs(g, C.teal, 1.5);
  },
  bell(g, x, y, s, col) {
    circ(g, x, y + s * 0.42, s * 0.11); fs(g, "#b8860b", 2);
    g.beginPath(); g.moveTo(x - s * 0.5, y + s * 0.38); g.quadraticCurveTo(x - s * 0.36, y + s * 0.26, x - s * 0.32, y - s * 0.05);
    g.quadraticCurveTo(x - s * 0.3, y - s * 0.42, x, y - s * 0.42); g.quadraticCurveTo(x + s * 0.3, y - s * 0.42, x + s * 0.32, y - s * 0.05);
    g.quadraticCurveTo(x + s * 0.36, y + s * 0.26, x + s * 0.5, y + s * 0.38); g.closePath(); fs(g, col || C.gold);
    g.fillStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.ellipse(x - s * 0.14, y - s * 0.1, s * 0.06, s * 0.18, 0.15, 0, TAU); g.fill();
    for (const d of [-1, 1]) { g.beginPath(); g.ellipse(x + d * s * 0.14, y - s * 0.5, s * 0.14, s * 0.08, d * 0.5, 0, TAU); fs(g, C.coral, 2); }
  },
  star(g, x, y, r, col, rot) {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.lineJoin = "round"; fs(g, col || C.gold, 2);
  },
  cane(g, x, y, s, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.lineCap = "round";
    const p = () => { g.beginPath(); g.moveTo(s * 0.12, s * 0.5); g.lineTo(s * 0.12, -s * 0.22); g.arc(-s * 0.06, -s * 0.22, s * 0.18, 0, Math.PI, true); g.lineTo(-s * 0.24, -s * 0.12); };
    p(); g.strokeStyle = INK; g.lineWidth = s * 0.17 + 4; g.stroke(); p(); g.strokeStyle = "#fff"; g.lineWidth = s * 0.17; g.stroke();
    p(); g.strokeStyle = C.coral; g.setLineDash([s * 0.1, s * 0.1]); g.stroke(); g.setLineDash([]); g.restore();
  },
  mitten(g, x, y, s, col) {
    g.beginPath(); g.ellipse(x - s * 0.27, y - s * 0.02, s * 0.12, s * 0.2, -0.5, 0, TAU); fs(g, col || C.coral);
    rr(g, x - s * 0.24, y - s * 0.42, s * 0.48, s * 0.62, s * 0.22); fs(g, col || C.coral);
    rr(g, x - s * 0.27, y + s * 0.16, s * 0.54, s * 0.18, 4); fs(g, "#fff", 2);
    D.flake(g, x, y - s * 0.12, s * 0.12, 0, "#fff");
  },
  cocoa(g, x, y, s) {
    g.strokeStyle = INK; g.lineWidth = s * 0.1 + 3; g.beginPath(); g.arc(x + s * 0.3, y, s * 0.16, -1.3, 1.3); g.stroke();
    g.strokeStyle = C.teal; g.lineWidth = s * 0.1; g.stroke();
    rr(g, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.62, 7); fs(g, C.teal);
    g.beginPath(); g.ellipse(x, y - s * 0.3, s * 0.28, s * 0.07, 0, 0, TAU); g.fillStyle = "#6b3f22"; g.fill();
    for (const [a, b] of [[-0.12, -0.33], [0.08, -0.36], [0.16, -0.3]]) { rr(g, x + a * s - s * 0.06, y + b * s - s * 0.05, s * 0.12, s * 0.1, 3); fs(g, "#fff", 1.5); }
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 2.5; g.lineCap = "round";
    for (const d of [-0.1, 0.1]) { g.beginPath(); g.moveTo(x + d * s, y - s * 0.45); g.quadraticCurveTo(x + d * s + s * 0.08, y - s * 0.56, x + d * s, y - s * 0.66); g.stroke(); }
    D.star(g, x, y, s * 0.1, C.gold);
  },
  tree(g, x, y, s) { // bottom center
    rr(g, x - s * 0.08, y - s * 0.16, s * 0.16, s * 0.16, 2); fs(g, "#7a4a26", 2);
    for (let i = 0; i < 3; i++) { const yy = y - s * 0.14 - i * s * 0.24, ww = s * (0.46 - i * 0.1); g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x + ww, yy); g.lineTo(x, yy - s * 0.38); g.closePath(); fs(g, i % 2 ? "#3d8a5c" : C.pine); }
    dot(g, x - s * 0.12, y - s * 0.24, s * 0.04, C.coral); dot(g, x + s * 0.14, y - s * 0.42, s * 0.04, C.gold); dot(g, x - s * 0.04, y - s * 0.6, s * 0.04, C.sky);
    D.star(g, x, y - s * 0.9, s * 0.1, C.gold);
  },
  gumdrop(g, x, y, r, col) {
    g.beginPath(); g.moveTo(x - r, y + r * 0.7); g.quadraticCurveTo(x - r * 1.05, y - r * 0.9, x, y - r * 0.95); g.quadraticCurveTo(x + r * 1.05, y - r * 0.9, x + r, y + r * 0.7); g.closePath(); fs(g, col);
    g.fillStyle = "rgba(255,255,255,.7)"; for (const [a, b] of [[-0.4, -0.1], [0.1, -0.5], [0.45, 0.05], [-0.1, 0.3], [0.3, 0.45]]) { g.fillRect(x + a * r, y + b * r, 2.2, 2.2); }
    g.fillStyle = "rgba(255,255,255,.4)"; g.beginPath(); g.ellipse(x - r * 0.4, y - r * 0.4, r * 0.18, r * 0.3, 0.5, 0, TAU); g.fill();
  },
  chimney(g, x, top, w, bottom) {
    rr(g, x, top + 8, w, bottom - top, 2); fs(g, "#b5523b");
    g.strokeStyle = "rgba(60,20,20,.35)"; g.lineWidth = 1.5; g.beginPath();
    for (let yy = top + 22, k = 0; yy < bottom; yy += 14, k++) { g.moveTo(x + 2, yy); g.lineTo(x + w - 2, yy); for (let xx = x + (k % 2 ? 10 : 20); xx < x + w - 4; xx += 20) { g.moveTo(xx, yy); g.lineTo(xx, yy + 14); } }
    g.stroke();
    rr(g, x - 6, top, w + 12, 14, 3); fs(g, "#8e3e2c");
    g.beginPath(); g.moveTo(x - 7, top + 2); g.quadraticCurveTo(x + w / 2, top - 14, x + w + 7, top + 2); g.quadraticCurveTo(x + w / 2, top + 7, x - 7, top + 2); fs(g, "#fff", 2);
  },
  iceCol(g, x, w, bottom) {
    g.fillStyle = "#d6f1fb"; g.fillRect(x, -4, w, bottom + 4); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(x, -4, w, bottom + 4);
    g.fillStyle = "rgba(255,255,255,.7)"; g.fillRect(x + 7, 0, 6, bottom - 6);
    for (let i = 0; i < 4; i++) D.icicle(g, x + 7 + i * (w - 14) / 3, bottom, 12, 14 + (i % 2) * 10);
  }
};

/* Backgrounds */
const SKY_STARS = Array.from({ length: 44 }, () => [Math.random() * W, Math.random() * H * 0.62, Math.random() * 1.4 + 0.5, Math.random() * TAU]);
function bgNight(g, t) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#1a1e40"); gr.addColorStop(1, "#4c3d70"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (const s of SKY_STARS) { g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2 + s[3]); dot(g, s[0], s[1], s[2], "#fff6d8"); } g.globalAlpha = 1;
  const mg = g.createRadialGradient(296, 74, 10, 296, 74, 70); mg.addColorStop(0, "rgba(255,243,196,.45)"); mg.addColorStop(1, "rgba(255,243,196,0)"); g.fillStyle = mg; g.fillRect(220, 0, 140, 150);
  dot(g, 296, 74, 22, "#fff3c4"); dot(g, 289, 69, 4, "rgba(220,200,140,.5)"); dot(g, 303, 82, 3, "rgba(220,200,140,.5)");
}
function bgDay(g) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#9fd2f0"); gr.addColorStop(1, "#fdf1df"); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
function bgCozy(g) {
  g.fillStyle = "#f6dcc0"; g.fillRect(0, 0, W, H); g.fillStyle = "#f0cfae"; for (let x = 0; x < W; x += 36) g.fillRect(x, 0, 18, H);
  g.strokeStyle = "#3d8a5c"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(-10, 18); for (let x = 0; x <= W + 20; x += 60) g.quadraticCurveTo(x + 30, 48, x + 60, 18); g.stroke();
  for (let x = 30, i = 0; x < W; x += 60, i++) D.ornament(g, x, 40, 6, ORN[i % ORN.length]);
}
function hills(g, y, col, off, amp) {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, y + Math.sin((x + off) / 52) * (amp || 10) + Math.sin((x + off) / 23) * (amp || 10) * 0.45);
  g.lineTo(W, H); g.closePath(); g.fill();
}
const hearts = n => "♥".repeat(Math.max(0, n)) + "♡".repeat(Math.max(0, 3 - n));

/* ---------- Game engines (each day uses one with its own twist) ---------- */

/* Catch: move the catcher, catch the good things, dodge the bad ones. */
function makeCatch(api, o) {
  let px = W / 2, target = null, kd = 0, items = [], t = 0, spawn = 0.5, lives = 3, combo = 0;
  const cy = H - 84;
  const drawItem = (g, it) => {
    if (it.kind === "gold") return D.star(g, it.x, it.y, it.s * 0.55, C.gold, it.rot);
    if (it.kind === "bad") {
      if (o.theme === "snow") return D.icicle(g, it.x, it.y - it.s * 0.55, it.s * 0.42, it.s * 1.1);
      if (o.theme === "cookie") return D.cookie(g, it.x, it.y, it.s * 0.46, true);
      return D.coal(g, it.x, it.y, it.s * 0.42);
    }
    if (o.theme === "snow") return D.flake(g, it.x, it.y, it.s * 0.5, it.rot);
    if (o.theme === "cookie") return it.sub % 3 === 0 ? D.ginger(g, it.x, it.y, it.s * 0.75) : D.cookie(g, it.x, it.y, it.s * 0.46, false);
    return D.present(g, it.x, it.y, it.s, it.s * 0.84, ORN[it.sub % ORN.length], it.sub % 2 ? C.gold : "#fff");
  };
  const drawCatcher = (g, x, y) => {
    if (o.catcher === "sleigh") return D.sleigh(g, x, y + 4, 92);
    if (o.catcher === "jar") {
      rr(g, x - 40, y - 16, 80, 62, 14); g.fillStyle = "rgba(220,240,255,.45)"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      rr(g, x - 44, y - 22, 88, 12, 5); fs(g, C.gold);
      g.fillStyle = "rgba(255,255,255,.8)"; g.fillRect(x - 30, y - 4, 5, 36);
      for (let i = 0; i < Math.min(9, api.get()); i++) D.flake(g, x - 24 + (i % 5) * 12, y + 34 - Math.floor(i / 5) * 12, 5, i, "#fff");
      return;
    }
    if (o.catcher === "plate") {
      g.beginPath(); g.ellipse(x, y + 8, 50, 13, 0, 0, TAU); fs(g, "#fff"); g.beginPath(); g.ellipse(x, y + 6, 34, 7, 0, 0, TAU); g.strokeStyle = C.sky; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < Math.min(5, api.get()); i++) D.cookie(g, x - 16 + (i % 3) * 16, y - 2 - Math.floor(i / 3) * 8, 10, false);
      return;
    }
    g.beginPath(); g.moveTo(x - 44, y - 12); g.quadraticCurveTo(x - 58, y + 40, x - 30, y + 48); g.lineTo(x + 30, y + 48); g.quadraticCurveTo(x + 58, y + 40, x + 44, y - 12); g.closePath(); fs(g, "#c9925a");
    g.beginPath(); g.ellipse(x, y - 12, 44, 9, 0, 0, TAU); fs(g, "#6b4423");
    g.strokeStyle = C.coral; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 46, y - 2); g.quadraticCurveTo(x, y + 8, x + 46, y - 2); g.stroke();
    D.star(g, x, y + 24, 9, C.gold);
  };
  function lose(x, y, word, snd) { lives--; combo = 0; api.sfx(snd); api.shake(); api.float(x, y, word, C.coral); if (lives <= 0) api.over(); }
  return {
    hud: () => hearts(lives),
    down(x) { target = x; },
    move(x, y, isDown, mouse) { if (isDown || mouse) target = x; },
    key(k, d) { if (k === "ArrowLeft") { kd = d ? -1 : (kd < 0 ? 0 : kd); return true; } if (k === "ArrowRight") { kd = d ? 1 : (kd > 0 ? 0 : kd); return true; } return false; },
    update(dt) {
      t += dt; const lv = Math.min(1, t / 70); spawn -= dt;
      if (spawn <= 0) {
        spawn = (0.95 - 0.5 * lv) * rnd(0.75, 1.25) / (o.rate || 1);
        const r = Math.random(), kind = r < (o.bad || 0.2) + 0.12 * lv ? "bad" : r > 1 - (o.gold || 0.05) ? "gold" : "good";
        items.push({ x: rnd(28, W - 28), y: -30, vy: rnd(115, 150) * (1 + lv * 0.9) * (o.speed || 1), kind, sub: ri(0, 11), rot: rnd(0, TAU), vr: rnd(-1.5, 1.5), ph: rnd(0, TAU), s: rnd(34, 42) });
      }
      if (target != null) px += (target - px) * Math.min(1, dt * 16);
      if (kd) { px += kd * 440 * dt; target = null; }
      px = clamp(px, 56, W - 56);
      for (const it of items) {
        it.y += it.vy * dt; it.rot += it.vr * dt;
        if (o.wind) it.x = clamp(it.x + Math.sin(t * 1.2 + it.ph) * o.wind * dt, 18, W - 18);
        if (!it.gone && it.y > cy - 24 && it.y < cy + 12 && Math.abs(it.x - px) < 48) {
          it.gone = true;
          if (it.kind === "bad") { lose(it.x, cy - 34, "Oops!", "bad"); if (lives <= 0) return; }
          else {
            combo++; const pts = it.kind === "gold" ? 5 : 1 + (combo >= 10 ? 1 : 0); api.add(pts);
            api.sfx(it.kind === "gold" ? "gold" : "ding", combo % 8); api.burst(it.x, cy - 12, it.kind === "gold" ? C.gold : "#fff", 7);
            if (it.kind === "gold") api.float(it.x, cy - 40, "+5", C.gold); else if (combo % 10 === 0) api.float(it.x, cy - 40, "Combo " + combo + "!", C.gold);
          }
        }
        if (!it.gone && it.y > H + 30) { it.gone = true; if (it.kind !== "bad") { lose(it.x, H - 40, "Missed", "miss"); if (lives <= 0) return; } }
      }
      items = items.filter(i => !i.gone);
    },
    draw(g, tt) {
      if (o.bg === "cozy") { bgCozy(g); g.fillStyle = "#c98f5c"; g.fillRect(0, H - 40, W, 40); g.fillStyle = "#b07a4a"; g.fillRect(0, H - 40, W, 6); }
      else { if (o.bg === "night") bgNight(g, tt); else bgDay(g); hills(g, H - 120, o.bg === "night" ? "#c9d6ee" : "#e3eefa", 40, 12); hills(g, H - 70, "#fff", 0, 8); }
      for (const it of items) drawItem(g, it);
      drawCatcher(g, px, cy);
    }
  };
}

/* Stack: tap to drop the sliding layer; overhangs get trimmed. */
function makeStack(api, o) {
  const bh = 24, baseY = H - 74;
  let L = [{ x: W / 2 - 75, w: 150 }], cur, cam = 0, perfect = 0, fall = [], dead = false;
  const yOf = i => baseY - i * bh;
  function nc() { const top = L[L.length - 1], left = L.length % 2 === 1; cur = { x: left ? -18 : W + 18 - top.w, w: top.w, d: left ? 1 : -1, sp: (140 + Math.min(L.length, 40) * 7) * (o.speed || 1) }; }
  nc();
  function layer(g, x, y, w, i) {
    if (w <= 0) return;
    if (o.style === "gift") {
      const col = ORN[i % ORN.length]; rr(g, x, y, w, bh, 4); fs(g, col);
      const rx = x + w / 2; g.fillStyle = i % 2 ? "#fff" : C.gold; if (w > 14) g.fillRect(rx - 4, y + 1.5, 8, bh - 3);
    } else if (o.style === "ice") {
      rr(g, x, y, w, bh, 3); fs(g, "#d6f1fb"); g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x + 4, y + 4, Math.max(0, w - 8), 4);
      g.strokeStyle = "rgba(95,168,222,.5)"; g.lineWidth = 1.5; g.beginPath(); for (let xx = x + (i % 2 ? 18 : 34); xx < x + w - 6; xx += 32) { g.moveTo(xx, y + 2); g.lineTo(xx, y + bh - 2); } g.stroke();
    } else {
      rr(g, x, y, w, bh, 6); fs(g, "#b8733d");
      g.strokeStyle = "#fff"; g.lineWidth = 3; g.lineCap = "round"; g.beginPath();
      for (let xx = x + 6, k = 0; xx < x + w - 6; xx += 8, k++) { g.lineTo(xx, y + 6 + (k % 2) * 4); } g.stroke();
      const cs = [C.coral, C.teal, C.gold]; for (let xx = x + 12, k = i; xx < x + w - 8; xx += 22, k++) dot(g, xx, y + 16, 3, cs[k % 3]);
    }
  }
  function drop() {
    if (dead) return;
    const top = L[L.length - 1], l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l, y = yOf(L.length);
    if (ov <= 3) { fall.push({ x: cur.x, w: cur.w, y, vy: 0, i: L.length, rot: 0 }); dead = true; cur = null; api.sfx("bad"); api.shake(); api.over(); return; }
    if (Math.abs(cur.x - top.x) <= 5) {
      perfect++; const grow = perfect >= 3 ? Math.min(10, 150 - top.w) : 0; L.push({ x: top.x - grow / 2, w: top.w + grow });
      api.add(2); api.sfx("perfect", perfect); api.float(W / 2, y + cam - 20, perfect >= 3 ? "Perfect x" + perfect + "!" : "Perfect!", C.gold); api.burst(top.x + top.w / 2, y + cam + 10, C.gold, 10);
    } else {
      perfect = 0;
      if (cur.x < top.x) fall.push({ x: cur.x, w: top.x - cur.x, y, vy: 0, i: L.length, rot: 0 }); else fall.push({ x: r, w: cur.x + cur.w - r, y, vy: 0, i: L.length, rot: 0 });
      L.push({ x: l, w: ov }); api.add(1); api.sfx("thud");
    }
    nc();
  }
  return {
    down: drop,
    key(k) { return false; },
    hud: () => (L.length - 1) + " high",
    update(dt) {
      if (cur) { cur.x += cur.d * cur.sp * dt; if (cur.x + cur.w > W + 20) { cur.x = W + 20 - cur.w; cur.d = -1; } if (cur.x < -20) { cur.x = -20; cur.d = 1; } }
      const camT = Math.max(0, (L.length - 11) * bh); cam += (camT - cam) * Math.min(1, dt * 5);
      for (const f of fall) { f.vy += 1000 * dt; f.y += f.vy * dt; f.rot += dt * 2; }
      fall = fall.filter(f => f.y + cam < H + 60);
    },
    draw(g, t) {
      if (o.style === "ginger") bgCozy(g); else if (o.style === "gift") bgNight(g, t); else bgDay(g);
      if (o.style !== "ginger") { hills(g, H - 150 + cam * 0.3, o.style === "gift" ? "#c9d6ee" : "#e3eefa", 20, 12); }
      g.save(); g.translate(0, cam);
      if (o.style === "ginger") { g.beginPath(); g.ellipse(W / 2, baseY + 28, 120, 16, 0, 0, TAU); fs(g, "#fff"); g.fillStyle = "#c98f5c"; g.fillRect(0, baseY + 40, W, 400); }
      else { hills(g, baseY + 22, "#fff", 0, 4); g.fillStyle = "#fff"; g.fillRect(0, baseY + 40, W, 400); }
      for (let i = 0; i < L.length; i++) { const yy = yOf(i); if (yy + cam > -bh && yy + cam < H + 10) layer(g, L[i].x, yy, L[i].w, i); }
      if (cur) layer(g, cur.x, yOf(L.length), cur.w, L.length);
      for (const f of fall) { g.save(); g.translate(f.x + f.w / 2, f.y + bh / 2); g.rotate(f.rot * (f.x < W / 2 ? -1 : 1)); layer(g, -f.w / 2, -bh / 2, f.w, f.i); g.restore(); }
      g.restore();
    }
  };
}

/* Flap: tap to fly up through the gaps. */
function makeFlap(api, o) {
  const X = 92, R = 15, ground = H - 38, PW = 58;
  let y = H * 0.42, vy = 0, pipes = [], dist = 0, ph = 0, scroll = 0, dead = false, waiting = true, bob = 0;
  function addPipe(x) {
    const gap = Math.max(o.gapMin || 132, (o.gap || 176) - api.get() * 1.4), lo = 50 + gap / 2, hi = ground - gap / 2 - 30, prev = pipes.length ? pipes[pipes.length - 1].gy : (lo + hi) / 2;
    const gy = clamp(prev + rnd(-165, 165), lo, hi);
    pipes.push({ x, gy, gap, passed: false, gift: o.collect && Math.random() < 0.65 ? { got: false, k: ri(0, 5), dy: rnd(-gap * 0.22, gap * 0.22) } : null });
  }
  addPipe(W + 60);
  function die() { if (dead) return; dead = true; api.sfx("bad"); api.shake(); api.over(); }
  const flap = () => { waiting = false; vy = -(o.lift || 380); api.sfx("flap"); };
  const player = (g) => {
    g.save(); g.translate(X, y); g.rotate(clamp(vy / 650, -0.5, 0.75));
    if (o.player === "robin") D.robin(g, 0, 0, 36, ph * 1.6);
    else if (o.player === "reindeer") D.reindeer(g, -4, 4, 46, ph, true);
    else D.sleigh(g, 0, 0, 46);
    g.restore();
  };
  return {
    down: flap, key() { return false; }, hud: () => waiting ? "Tap to fly!" : "",
    update(dt) {
      if (waiting) { bob += dt; ph += dt * 10; y = H * 0.42 + Math.sin(bob * 4) * 8; vy = 0; scroll += 60 * dt; return; }
      const sp = (o.speed || 1) * (150 + Math.min(70, api.get() * 2.4));
      vy += 1250 * dt; y += vy * dt; ph += dt * 10; dist += sp * dt; scroll += sp * dt;
      if (y < R) { y = R; vy = 0; }
      for (const p of pipes) {
        p.x -= sp * dt;
        if (!p.passed && p.x + PW < X - R) { p.passed = true; api.add(1); api.sfx("ding", api.get() % 8); }
        if (X + R - 5 > p.x && X - R + 5 < p.x + PW && (y - R + 5 < p.gy - p.gap / 2 || y + R - 5 > p.gy + p.gap / 2)) return die();
        if (p.gift && !p.gift.got && Math.hypot(X - (p.x + PW / 2), y - (p.gy + p.gift.dy)) < 28) { p.gift.got = true; api.add(3); api.sfx("gold"); api.float(p.x + PW / 2, p.gy + p.gift.dy - 24, "+3", C.gold); api.burst(p.x + PW / 2, p.gy + p.gift.dy, C.gold, 10); }
      }
      if (pipes[pipes.length - 1].x < W - (o.spacing || 205)) addPipe(W + 10);
      pipes = pipes.filter(p => p.x > -PW - 20);
      if (y + R > ground) { y = ground - R; die(); }
    },
    draw(g, t) {
      if (o.bg === "night") bgNight(g, t); else bgDay(g);
      hills(g, H - 150, o.bg === "night" ? "#7d79a8" : "#cfe3f5", scroll * 0.2, 14);
      hills(g, H - 100, o.bg === "night" ? "#c9d6ee" : "#e8f1fb", scroll * 0.45, 10);
      for (const p of pipes) {
        D.iceCol(g, p.x, PW, p.gy - p.gap / 2 - 22);
        D.chimney(g, p.x, p.gy + p.gap / 2, PW, ground + 10);
        if (p.gift && !p.gift.got) D.present(g, p.x + PW / 2, p.gy + p.gift.dy, 24, 20, ORN[p.gift.k], C.gold);
      }
      g.fillStyle = "#fff"; g.fillRect(0, ground, W, H - ground); g.strokeStyle = "#b9d3ec"; g.lineWidth = 2; g.beginPath();
      for (let xx = -((scroll * 1) % 40); xx < W; xx += 40) { g.moveTo(xx, ground + 14); g.lineTo(xx + 16, ground + 14); } g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, ground); g.lineTo(W, ground); g.stroke();
      player(g);
    }
  };
}

/* Pop: tap groups of 2 or more matching pieces before the timer runs out. */
function makePop(api, o) {
  const cols = o.cols, rows = o.rows, top = 58, area = H - top - 12;
  const cs = Math.min((W - 14) / cols, area / rows), ox = (W - cs * cols) / 2, oy = top + (area - cs * rows) / 2;
  let time = o.time || 60, grid = [], hint = 0;
  const nk = () => ri(0, o.colors - 1);
  for (let c = 0; c < cols; c++) { const col = []; for (let r = 0; r < rows; r++) col.push({ k: nk(), y: r - rows - 1 - c * 0.3 }); grid.push(col); }
  function group(c, r) {
    const k = grid[c][r].k, seen = new Set([c + "," + r]), out = [[c, r]], q = [[c, r]];
    while (q.length) { const [a, b] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + dc, y = b + dr; if (x < 0 || y < 0 || x >= cols || y >= rows) continue; const id = x + "," + y; if (seen.has(id) || grid[x][y].k !== k) continue; seen.add(id); out.push([x, y]); q.push([x, y]); } }
    return out;
  }
  function anyMove() { for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const k = grid[c][r].k; if ((c + 1 < cols && grid[c + 1][r].k === k) || (r + 1 < rows && grid[c][r + 1].k === k)) return true; } return false; }
  const piece = (g, x, y, k, s) => o.style === "candy" ? D.gumdrop(g, x, y + s * 0.06, s * 0.4, ORN[k]) : D.ornament(g, x, y + s * 0.06, s * 0.36, ORN[k]);
  return {
    hud: () => "⏱ " + Math.max(0, Math.ceil(time)),
    key() { return false; },
    down(x, y) {
      const c = Math.floor((x - ox) / cs), r = Math.floor((y - oy) / cs);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const gr = group(c, r);
      if (gr.length < 2) { api.sfx("tok"); hint = 0.3; return; }
      const n = gr.length, pts = n * (n - 1); api.add(pts); api.sfx("pop", n);
      let sx = 0, sy = 0;
      for (const [a, b] of gr) { const px = ox + a * cs + cs / 2, py = oy + b * cs + cs / 2; sx += px; sy += py; api.burst(px, py, ORN[grid[a][b].k], REDUCED ? 2 : 4); grid[a][b].dead = true; }
      api.float(sx / n, sy / n, "+" + pts, "#fff");
      if (n >= 6) { const bonus = Math.min(5, n - 4); time += bonus; api.float(sx / n, sy / n + 26, "+" + bonus + "s", C.gold); api.sfx("sparkle"); }
      for (let a = 0; a < cols; a++) {
        const kept = grid[a].filter(p => !p.dead), miss = rows - kept.length; if (!miss) continue;
        const fresh = []; for (let i = 0; i < miss; i++) fresh.push({ k: nk(), y: -miss + i - 0.4 });
        grid[a] = fresh.concat(kept);
      }
      if (!anyMove()) { for (const col of grid) for (const p of col) p.k = nk(); api.float(W / 2, H / 2, "Shuffle!", C.gold); }
    },
    update(dt) {
      time -= dt; if (hint > 0) hint -= dt;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const p = grid[c][r]; if (p.y < r) p.y = Math.min(r, p.y + dt * 16); else p.y = r; }
      if (time <= 0) { time = 0; api.over(); }
    },
    draw(g, t) {
      if (o.style === "candy") bgCozy(g); else bgNight(g, t);
      rr(g, ox - 6, oy - 6, cs * cols + 12, cs * rows + 12, 14); g.fillStyle = o.style === "candy" ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.12)"; g.fill();
      g.save(); g.beginPath(); g.rect(ox - 6, oy - 6, cs * cols + 12, cs * rows + 12); g.clip();
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const p = grid[c][r]; piece(g, ox + c * cs + cs / 2, oy + p.y * cs + cs / 2, p.k, cs); }
      g.restore();
      if (time < 6 && time > 0) { g.globalAlpha = 0.15 + 0.15 * Math.sin(t * 12); g.fillStyle = C.coral; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    }
  };
}

/* Timing: tap when the marker is inside the gold zone. The zone shrinks and speeds up. */
function makeTiming(api, o) {
  let ph = 0.13, sp = o.speed || 0.5, zc = 0.5, zw = 0.28, lives = 3, done = 0, anim = 0, wob = 0, swing = 0;
  const val = () => o.mode === "dial" ? ((ph % 1) + 1) % 1 : 1 - Math.abs((ph % 2) - 1);
  const BX = 40, BW = W - 80, BY = H - 110;
  return {
    hud: () => hearts(lives), key() { return false; },
    down() {
      const v = val(); let d = Math.abs(v - zc); if (o.mode === "dial") d = Math.min(d, 1 - d);
      const fx = o.mode === "dial" ? W / 2 : BX + v * BW, fy = o.mode === "dial" ? 140 : BY - 30;
      if (d <= zw / 2) {
        const perf = d < zw * 0.17; done++; api.add(perf ? 3 : 1); api.sfx(perf ? "perfect" : "ding", done);
        api.float(fx, fy, perf ? "Perfect!" : "Nice!", C.gold); api.burst(fx, fy + 10, C.gold, 8); anim = 1; swing = 1;
        zw = Math.max(0.075, zw * 0.92); sp *= 1.045;
        if (o.mode === "dial") zc = (v + rnd(0.3, 0.7)) % 1; else { let n; do { n = rnd(zw / 2 + 0.03, 1 - zw / 2 - 0.03); } while (Math.abs(n - v) < 0.22); zc = n; }
      } else { lives--; wob = 1; api.sfx("bad"); api.shake(); api.float(fx, fy, "Missed", C.coral); if (lives <= 0) api.over(); }
    },
    update(dt) { ph += dt * sp * (o.mode === "dial" ? 1 : 2); anim = Math.max(0, anim - dt * 2.5); wob = Math.max(0, wob - dt * 3); swing *= Math.pow(0.04, dt); },
    draw(g, t) {
      const v = val();
      if (o.mode === "wrap") {
        bgCozy(g); g.fillStyle = "#c98f5c"; g.fillRect(0, H - 60, W, 60);
        const stage = done % 3, cx = W / 2 + Math.sin(wob * 20) * wob * 8, cy = 250, s = 1 + anim * 0.12;
        g.save(); g.translate(cx, cy); g.scale(s, s);
        if (stage === 0 && done > 0 && anim > 0) { D.present(g, 0, 0, 150, 120, ORN[(Math.floor(done / 3) + 1) % 6], C.gold); D.star(g, 0, -100, 18 * anim + 6, C.gold); }
        else if (stage === 0) { rr(g, -75, -60, 150, 120, 6); fs(g, "#c9925a"); g.strokeStyle = "#a0723f"; g.lineWidth = 3; g.beginPath(); g.moveTo(-75, -30); g.lineTo(75, -30); g.stroke(); }
        else { rr(g, -75, -60, 150, 120, 6); fs(g, ORN[Math.floor(done / 3) % 6]); for (let i = 0; i < 12; i++) dot(g, -56 + (i % 4) * 37, -38 + Math.floor(i / 4) * 38 + (i % 2) * 8, 5, "rgba(255,255,255,.55)");
          if (stage === 2) { g.fillStyle = C.gold; g.fillRect(-12, -58.5, 24, 117); g.fillRect(-73.5, -12, 147, 24); } }
        g.restore();
        for (let i = 0; i < Math.min(9, Math.floor(done / 3)); i++) D.present(g, 30 + i * 37, H - 76, 30, 26, ORN[i % 6], i % 2 ? "#fff" : C.gold);
        text(g, ["Wrap it!", "Ribbon!", "Bow!"][stage], W / 2, 360, 22, C.navy);
      } else if (o.mode === "bell") {
        bgNight(g, t); hills(g, H - 150, "#c9d6ee", 0, 10);
        g.strokeStyle = "#6b4423"; g.lineWidth = 8; g.beginPath(); g.moveTo(W / 2 - 110, 70); g.lineTo(W / 2 + 110, 70); g.stroke();
        g.save(); g.translate(W / 2, 74); g.rotate(Math.sin(t * 18) * 0.35 * swing + Math.sin(wob * 30) * wob * 0.1); D.bell(g, 0, 110, 150); g.restore();
        for (let i = 0; i < Math.min(12, done); i++) D.star(g, 30 + (i % 6) * 60, 300 + Math.floor(i / 6) * 34 + (i % 2) * 6, 9, ORN[i % 6]);
      } else {
        bgNight(g, t);
        const cx = W / 2, cy = 270, R = 112;
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU - Math.PI / 2, on = i < done % 17; dot(g, cx + Math.cos(a) * (R + 30), cy + Math.sin(a) * (R + 30), 7, on ? ORN[i % 6] : "rgba(255,255,255,.2)"); }
        g.lineWidth = 22; g.strokeStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
        g.strokeStyle = C.gold; g.lineCap = "butt"; g.beginPath(); g.arc(cx, cy, R, (zc - zw / 2) * TAU - Math.PI / 2, (zc + zw / 2) * TAU - Math.PI / 2); g.stroke();
        const glow = Math.min(1, 0.25 + done * 0.06);
        const gg = g.createRadialGradient(cx, cy, 10, cx, cy, 90); gg.addColorStop(0, "rgba(255,220,120," + glow + ")"); gg.addColorStop(1, "rgba(255,220,120,0)"); g.fillStyle = gg; g.fillRect(cx - 95, cy - 95, 190, 190);
        D.star(g, cx, cy, 46 + anim * 10, C.gold, Math.sin(t) * 0.1);
        const a = v * TAU - Math.PI / 2; g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26)); g.lineTo(cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14)); g.stroke();
        g.strokeStyle = C.coral; g.lineWidth = 4; g.stroke();
        return;
      }
      rr(g, BX - 4, BY - 4, BW + 8, 34, 17); fs(g, "#fff6e5", 3);
      rr(g, BX + (zc - zw / 2) * BW, BY, zw * BW, 26, 12); g.fillStyle = C.gold; g.fill();
      g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(BX + zc * BW - 2, BY + 3, 4, 20);
      const mx = BX + v * BW; g.beginPath(); g.moveTo(mx, BY + 6); g.lineTo(mx - 11, BY - 16); g.lineTo(mx + 11, BY - 16); g.closePath(); fs(g, C.coral, 2.5);
      g.fillStyle = INK; g.fillRect(mx - 2, BY, 4, 26);
    }
  };
}

/* Whack: tap the friendly faces as they peek out; leave the snowmen alone. */
function makeWhack(api, o) {
  const holes = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) holes.push({ x: 66 + c * 114, y: (o.house ? 186 : 214) + r * 118, st: 0, h: 0, kind: "good", stay: 0, bonk: 0 });
  let time = o.time || 40, spawn = 0.6, t = 0, combo = 0;
  return {
    hud: () => "⏱ " + Math.max(0, Math.ceil(time)), key() { return false; },
    down(x, y) {
      for (const h of holes) {
        if ((h.st === 1 || h.st === 2) && h.h > 0.35 && Math.abs(x - h.x) < 50 && y > h.y - 92 && y < h.y + 22) {
          if (h.kind === "good") { combo++; const p = combo >= 5 ? 2 : 1; api.add(p); api.sfx("ding", combo % 8); api.burst(h.x, h.y - 50, C.gold, 8); if (combo % 5 === 0) api.float(h.x, h.y - 80, "Streak " + combo + "!", C.gold); }
          else { combo = 0; time = Math.max(0, time - 3); api.sfx("bad"); api.shake(); api.float(h.x, h.y - 80, "-3s", C.coral); }
          h.st = 4; h.bonk = 1; return;
        }
      }
    },
    update(dt) {
      t += dt; time -= dt; if (time <= 0) { time = 0; api.over(); return; }
      const lv = Math.min(1, t / 40); spawn -= dt;
      if (spawn <= 0) {
        spawn = rnd(0.5, 0.85) * (1 - 0.45 * lv) / (o.rate || 1);
        const idle = holes.filter(h => h.st === 0);
        if (idle.length) { const h = pick(idle); h.st = 1; h.kind = Math.random() < (o.bad || 0.22) + 0.08 * lv ? "bad" : "good"; h.stay = rnd(0.85, 1.25) * (1 - 0.4 * lv); }
      }
      for (const h of holes) {
        if (h.st === 1) { h.h += dt * 6; if (h.h >= 1) { h.h = 1; h.st = 2; } }
        else if (h.st === 2) { h.stay -= dt; if (h.stay <= 0) h.st = 3; }
        else if (h.st === 3) { h.h -= dt * 5; if (h.h <= 0) { h.h = 0; h.st = 0; if (h.kind === "good") combo = 0; } }
        else if (h.st === 4) { h.h -= dt * 4; h.bonk = Math.max(0, h.bonk - dt * 2); if (h.h <= 0) { h.h = 0; h.st = 0; } }
      }
    },
    draw(g, gt) {
      if (o.house) {
        bgNight(g, gt); rr(g, 8, 110, W - 16, H - 100, 10); fs(g, "#9a5a3a");
        g.beginPath(); g.moveTo(0, 116); g.lineTo(W / 2, 40); g.lineTo(W, 116); g.closePath(); fs(g, "#5a3d6b");
        g.beginPath(); g.moveTo(-4, 116); g.quadraticCurveTo(W / 2, 96, W + 4, 116); g.lineTo(W / 2, 34); g.closePath(); fs(g, "#fff", 2);
      } else { bgDay(g); hills(g, 150, "#e3eefa", 0, 12); g.fillStyle = "#fff"; g.fillRect(0, 170, W, H); }
      for (const h of holes) {
        const who = (g2) => { if (h.kind === "bad") D.snowman(g2, h.x, h.y + 8 - h.h * 70 + 70, 74); else if (o.good === "elf") D.elf(g2, h.x, h.y + 52 - h.h * 82, 56); else D.penguin(g2, h.x, h.y + 6 - h.h * 64 + 64, 66, Math.sin(gt * 10) * 0.3); };
        if (o.house) {
          rr(g, h.x - 42, h.y - 82, 84, 84, 6); fs(g, "#ffd98a", 3);
          g.save(); rr(g, h.x - 40, h.y - 80, 80, 80, 5); g.clip(); if (h.h > 0) who(g); g.restore();
          g.strokeStyle = INK; g.lineWidth = 3; rr(g, h.x - 42, h.y - 82, 84, 84, 6); g.stroke();
          rr(g, h.x - 48, h.y - 2, 96, 12, 4); fs(g, "#fff", 2.5);
        } else {
          g.beginPath(); g.ellipse(h.x, h.y + 4, 58, 26, 0, 0, TAU); fs(g, "#eef5fc", 2.5);
          g.beginPath(); g.ellipse(h.x, h.y, 44, 15, 0, 0, TAU); g.fillStyle = "#3e5476"; g.fill();
          g.save(); g.beginPath(); g.rect(h.x - 60, h.y - 130, 120, 130); g.clip(); if (h.h > 0) who(g); g.restore();
          g.beginPath(); g.ellipse(h.x, h.y, 44, 15, 0, 0.05, Math.PI - 0.05); g.ellipse(h.x, h.y + 4, 58, 26, 0, Math.PI, 0, true); g.closePath(); fs(g, "#fff", 0);
          g.beginPath(); g.ellipse(h.x, h.y + 4, 58, 26, 0, 0, Math.PI); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
        }
        if (h.bonk > 0) for (let i = 0; i < 3; i++) { const a = gt * 6 + i * TAU / 3; D.star(g, h.x + Math.cos(a) * 26, h.y - 74 + Math.sin(a) * 8, 6, C.gold); }
      }
    }
  };
}

/* Run: tap to jump over obstacles; grab candy canes for bonus points. */
function makeRun(api, o) {
  const GY = H - 112, X = 80;
  let y = GY, vy = 0, jumps = 0, t = 0, dist = 0, obs = [], candies = [], next = 260, legs = 0, cand = 0;
  const maxJ = o.double ? 2 : 1;
  function jump() { if (jumps < maxJ) { vy = jumps ? -640 : -760; jumps++; api.sfx("jump"); } }
  function drawOb(g, ob) {
    if (ob.kind === "snowman") D.snowman(g, ob.x + ob.w / 2, GY, ob.h);
    else if (ob.kind === "tree") D.tree(g, ob.x + ob.w / 2, GY, ob.h);
    else if (ob.kind === "stack") { D.present(g, ob.x + ob.w / 2, GY - 15, 34, 30, C.teal, C.gold); D.present(g, ob.x + ob.w / 2, GY - 44, 26, 22, C.coral, "#fff"); }
    else D.present(g, ob.x + ob.w / 2, GY - 16, ob.w, 32, C.plum, C.gold);
  }
  return {
    hud: () => "", key() { return false; }, down: jump, start() {},
    update(dt) {
      t += dt; const sp = (o.speed || 1) * (250 + Math.min(290, t * 9)); dist += sp * dt; legs += dt * sp / 22;
      vy += 2300 * dt; y += vy * dt; if (y >= GY) { y = GY; vy = 0; jumps = 0; }
      next -= sp * dt;
      if (next <= 0) {
        const kinds = o.kinds || ["snowman", "gift", "stack"], kind = pick(kinds);
        const dims = { snowman: [34, 60], gift: [34, 32], stack: [36, 64], tree: [40, 66] }[kind];
        obs.push({ x: W + 20, w: dims[0], h: dims[1], kind });
        if (o.double && Math.random() < 0.25) obs.push({ x: W + 20 + dims[0] + 40, w: 34, h: 32, kind: "gift" });
        if (Math.random() < 0.45) candies.push({ x: W + 20 + sp * 0.4, y: GY - rnd(110, o.double ? 210 : 160), got: false });
        next = sp * rnd(0.85, 1.55);
      }
      for (const ob of obs) { ob.x -= sp * dt; if (X + 13 > ob.x + 5 && X - 13 < ob.x + ob.w - 5 && y > GY - ob.h + 8) { api.sfx("bad"); api.shake(); api.over(); return; } }
      for (const c of candies) { c.x -= sp * dt; if (!c.got && Math.hypot(c.x - X, c.y - (y - 22)) < 30) { c.got = true; cand++; api.sfx("gold"); api.float(c.x, c.y - 20, "+5", C.gold); api.burst(c.x, c.y, "#fff", 8); } }
      obs = obs.filter(ob => ob.x > -80); candies = candies.filter(c => c.x > -40 && !c.got);
      api.set(Math.floor(dist / 40) + cand * 5);
    },
    draw(g, gt) {
      if (o.bg === "night") bgNight(g, gt); else bgDay(g);
      hills(g, GY - 110, o.bg === "night" ? "#7d79a8" : "#cfe3f5", dist * 0.15, 16);
      hills(g, GY - 50, o.bg === "night" ? "#c9d6ee" : "#e8f1fb", dist * 0.4, 10);
      g.fillStyle = "#fff"; g.fillRect(0, GY, W, H - GY); g.strokeStyle = "#b9d3ec"; g.lineWidth = 2; g.beginPath();
      for (let xx = -(dist % 46); xx < W; xx += 46) { g.moveTo(xx, GY + 20); g.lineTo(xx + 18, GY + 20); g.moveTo(xx + 23, GY + 46); g.lineTo(xx + 34, GY + 46); } g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, GY); g.lineTo(W, GY); g.stroke();
      for (const c of candies) D.cane(g, c.x, c.y, 30, 0.2);
      for (const ob of obs) drawOb(g, ob);
      const air = y < GY - 1;
      if (o.player === "reindeer") D.reindeer(g, X, y - 32, 56, air ? 0.6 : legs, air);
      else if (o.player === "sleigh") D.sleigh(g, X, y - 22, 58);
      else { g.save(); g.translate(X, y); g.rotate(air ? -0.15 : Math.sin(legs) * 0.08); D.penguin(g, 0, 0, 50, air ? 0.8 : 0); g.restore(); }
    }
  };
}

/* Memory: flip two cards at a time to find pairs. Clear the board for bonus time. */
function makeMemory(api, o) {
  const ICONS = [
    (g, x, y, s) => D.present(g, x, y + s * 0.06, s * 0.62, s * 0.52, C.coral, C.gold),
    (g, x, y, s) => D.ornament(g, x, y + s * 0.05, s * 0.3, C.teal),
    (g, x, y, s) => D.ginger(g, x, y, s * 0.62),
    (g, x, y, s) => D.flake(g, x, y, s * 0.34, 0, C.sky),
    (g, x, y, s) => D.bell(g, x, y, s * 0.66),
    (g, x, y, s) => D.star(g, x, y, s * 0.34, C.gold),
    (g, x, y, s) => D.cane(g, x, y, s * 0.6, 0.15),
    (g, x, y, s) => D.mitten(g, x, y, s * 0.72, C.plum),
    (g, x, y, s) => D.cocoa(g, x, y + s * 0.08, s * 0.62),
    (g, x, y, s) => D.tree(g, x, y + s * 0.38, s * 0.72),
    (g, x, y, s) => D.penguin(g, x, y + s * 0.34, s * 0.66, 0),
    (g, x, y, s) => D.snowman(g, x, y + s * 0.4, s * 0.62)
  ];
  const cols = o.cols, rows = o.pairs * 2 / cols, top = 58, gap = 8;
  const cw = (W - 20 - gap * (cols - 1)) / cols, ch = Math.min(cw * 1.22, (H - top - 14 - gap * (rows - 1)) / rows);
  const ox = (W - (cw * cols + gap * (cols - 1))) / 2, oy = top + ((H - top - 14) - (ch * rows + gap * (rows - 1))) / 2;
  let cards = [], sel = [], lock = 0, time = o.time || 60, streak = 0, refill = 0;
  function deal() {
    const ids = ICONS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, o.pairs), deck = ids.concat(ids).sort(() => Math.random() - 0.5);
    cards = deck.map((id, i) => ({ id, up: false, done: false, f: 0, x: ox + (i % cols) * (cw + gap), y: oy + Math.floor(i / cols) * (ch + gap) }));
  }
  deal();
  return {
    hud: () => "⏱ " + Math.max(0, Math.ceil(time)), key() { return false; },
    down(x, y) {
      if (lock > 0 || refill > 0) return;
      const c = cards.find(c => x >= c.x && x <= c.x + cw && y >= c.y && y <= c.y + ch);
      if (!c || c.up || c.done) return;
      c.up = true; sel.push(c); api.sfx("tok");
      if (sel.length === 2) {
        if (sel[0].id === sel[1].id) {
          streak++; for (const s of sel) { s.done = true; api.burst(s.x + cw / 2, s.y + ch / 2, C.gold, 6); }
          api.add(1 + (streak >= 3 ? 1 : 0)); api.sfx("ding", streak); sel = [];
          if (streak >= 3) api.float(W / 2, oy - 14, "Streak " + streak + "!", C.gold);
          if (cards.every(c => c.done)) { time += 8; api.float(W / 2, H / 2, "+8s  New board!", C.gold); api.sfx("win"); refill = 0.9; }
        } else { streak = 0; lock = 0.75; }
      }
    },
    update(dt) {
      time -= dt; if (time <= 0) { time = 0; api.over(); return; }
      if (lock > 0) { lock -= dt; if (lock <= 0) { for (const s of sel) s.up = false; sel = []; } }
      if (refill > 0) { refill -= dt; if (refill <= 0) deal(); }
      for (const c of cards) { const tgt = c.up || c.done ? 1 : 0; c.f += clamp(tgt - c.f, -dt * 7, dt * 7); }
    },
    draw(g, t) {
      bgNight(g, t);
      for (const c of cards) {
        const sx = Math.abs(Math.cos(c.f * Math.PI)), face = c.f > 0.5;
        g.save(); g.translate(c.x + cw / 2, c.y + ch / 2); g.scale(Math.max(0.02, sx), 1);
        rr(g, -cw / 2, -ch / 2, cw, ch, 10);
        if (face) { fs(g, c.done ? "#fff3cf" : C.cream, 2.5); ICONS[c.id](g, 0, 0, Math.min(cw, ch)); }
        else { fs(g, "#3d4380", 2.5); g.strokeStyle = "rgba(255,201,74,.55)"; g.lineWidth = 2; rr(g, -cw / 2 + 6, -ch / 2 + 6, cw - 12, ch - 12, 6); g.stroke(); D.flake(g, 0, 0, Math.min(cw, ch) * 0.2, 0, "rgba(255,201,74,.85)"); }
        g.restore();
      }
    }
  };
}

const ENGINES = { catch: makeCatch, stack: makeStack, flap: makeFlap, pop: makePop, timing: makeTiming, whack: makeWhack, run: makeRun, memory: makeMemory };

/* ---------- The 25 days ---------- */
const TAP = "Tap or press space";
const DAYS = {
  1: { t: "Gift Drop", e: "catch", o: { theme: "gift", catcher: "sack", bg: "day" }, how: "Slide the sack to catch falling presents. Dodge the coal. Gold stars are worth 5.", s: [15, 40, 80] },
  2: { t: "Gingerbread Tower", e: "stack", o: { style: "ginger" }, how: TAP + " to drop each layer. Line it up perfectly to keep it wide.", s: [10, 22, 36] },
  3: { t: "Chimney Hop", e: "flap", o: { player: "sleigh", bg: "night" }, how: TAP + " to lift the sleigh between the icicles and chimneys.", s: [5, 15, 30] },
  4: { t: "Ornament Pop", e: "pop", o: { cols: 6, rows: 8, colors: 5, time: 60, style: "orn" }, how: "Tap groups of 2 or more matching ornaments. Bigger groups score way more and add time.", s: [300, 800, 1400] },
  5: { t: "Wrap It Up", e: "timing", o: { mode: "wrap", speed: 0.5 }, how: TAP + " when the arrow is in the gold zone. Three hits wraps a gift.", s: [6, 14, 24] },
  6: { t: "Peekaboo Penguins", e: "whack", o: { good: "penguin", time: 40 }, how: "Tap the penguins as they pop up. Leave the snowmen alone, they cost 3 seconds.", s: [20, 45, 70] },
  7: { t: "Penguin Slide", e: "run", o: { player: "penguin", bg: "day", kinds: ["snowman", "gift", "stack"] }, how: TAP + " to hop over snowmen and presents. Grab candy canes for +5.", s: [60, 180, 350] },
  8: { t: "Snowflake Jar", e: "catch", o: { theme: "snow", catcher: "jar", bg: "night", wind: 60, speed: 0.9 }, how: "Catch the drifting snowflakes in your jar. Watch out for icicles.", s: [15, 40, 80] },
  9: { t: "Present Pile", e: "stack", o: { style: "gift", speed: 1.08 }, how: TAP + " to stack the presents as high as you can.", s: [10, 22, 36] },
  10: { t: "Robin's Flight", e: "flap", o: { player: "robin", bg: "day", gap: 184, lift: 350 }, how: TAP + " to flap. Help the robin weave through the winter sky.", s: [5, 15, 30] },
  11: { t: "Matching Mittens", e: "memory", o: { pairs: 6, cols: 3, time: 60 }, how: "Flip two cards at a time to find pairs. Clear the board for 8 bonus seconds.", s: [10, 22, 34] },
  12: { t: "Ring the Bell", e: "timing", o: { mode: "bell", speed: 0.6 }, how: TAP + " when the arrow is in the gold zone to ring the bell.", s: [6, 14, 24] },
  13: { t: "Gumdrop Pop", e: "pop", o: { cols: 7, rows: 9, colors: 5, time: 60, style: "candy" }, how: "Tap groups of 2 or more matching gumdrops. Big groups add time.", s: [350, 900, 1600] },
  14: { t: "Cookie Catch", e: "catch", o: { theme: "cookie", catcher: "plate", bg: "cozy", speed: 1.05 }, how: "Catch fresh cookies on the plate. Skip the burnt ones!", s: [15, 40, 80] },
  15: { t: "Elf Windows", e: "whack", o: { good: "elf", house: true, time: 40, rate: 1.1 }, how: "Tap the elves peeking out of the windows. Don't tap the snowmen.", s: [20, 45, 70] },
  16: { t: "Reindeer Leap", e: "run", o: { player: "reindeer", bg: "day", double: true, kinds: ["snowman", "stack", "tree"] }, how: TAP + " to jump. Tap again in the air for a double jump.", s: [60, 180, 350] },
  17: { t: "Igloo Builder", e: "stack", o: { style: "ice", speed: 1.15 }, how: TAP + " to drop each ice block. Perfect drops build fastest.", s: [10, 22, 36] },
  18: { t: "Ornament Memory", e: "memory", o: { pairs: 8, cols: 4, time: 70 }, how: "Find every pair. Streaks of 3 or more give bonus points.", s: [10, 24, 36] },
  19: { t: "Snowstorm Flight", e: "flap", o: { player: "reindeer", bg: "night", speed: 1.12, gap: 182, lift: 380 }, how: TAP + " to fly the reindeer through the snowstorm.", s: [5, 15, 30] },
  20: { t: "Ornament Frenzy", e: "pop", o: { cols: 7, rows: 9, colors: 6, time: 45, style: "orn" }, how: "Six colors, 45 seconds. Hunt for big groups to earn more time.", s: [250, 600, 1100] },
  21: { t: "Gift Rush", e: "catch", o: { theme: "gift", catcher: "sleigh", bg: "night", speed: 1.2, rate: 1.2, gold: 0.09 }, how: "Catch gifts in the sleigh before they hit the snow. More gold stars, more speed!", s: [20, 50, 95] },
  22: { t: "Light the Star", e: "timing", o: { mode: "dial", speed: 0.42 }, how: TAP + " when the pointer crosses the gold arc to light up the tree.", s: [6, 14, 24] },
  23: { t: "Penguin Party", e: "whack", o: { good: "penguin", time: 45, rate: 1.3, bad: 0.3 }, how: "So many penguins! Tap fast, but dodge the snowmen.", s: [25, 55, 85] },
  24: { t: "Christmas Eve Dash", e: "run", o: { player: "sleigh", bg: "night", double: true, speed: 1.15, kinds: ["snowman", "gift", "tree", "stack"] }, how: TAP + " to jump, twice for a double jump. Deliver by morning!", s: [60, 200, 400] },
  25: { t: "Sleigh Ride Finale", e: "flap", o: { player: "sleigh", bg: "night", collect: true, gap: 186 }, how: TAP + " to fly. Scoop up presents for +3 each. Merry Christmas!", s: [10, 30, 60] }
};
/* ---------- Levels: easiest first, a sampler of game types for the free ones ---------- */
const ORDER = [1, 2, 3, 4, 6, 5, 7, 11, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const NLV = ORDER.length, FREE = 4;
const LV = L => DAYS[ORDER[L - 1]];
const starsFor = (L, sc) => LV(L).s.filter(x => sc >= x).length;
const won = L => S.best[L] != null && starsFor(L, S.best[L]) >= 1;

/* ---------- Games Pass (or a Holiday Pass) and this device's id, shared with the Wishwell beta ---------- */
const PASS_KEY = "wishwell-games-pass";
function readPass() {
  try { const g = JSON.parse(localStorage.getItem(PASS_KEY) || "null"); if (g && g.key && g.email) return { key: g.key, email: g.email, kind: "games" }; } catch (e) {}
  try { const h = JSON.parse(localStorage.getItem("wishwell-beta-pass") || "null"); if (h && h.ok && h.key && h.email) return { key: h.key, email: h.email, kind: "holiday" }; } catch (e) {}
  return null;
}
function deviceId() {
  let d = "";
  try {
    d = localStorage.getItem("wishwell-device") || "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(d)) {
      d = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9]/g, "");
      localStorage.setItem("wishwell-device", d);
    }
  } catch (e) {}
  return d;
}

/* ---------- App ---------- */
function mount(root, opt) {
  opt = opt || {};
  const net = opt.net || {}, URL0 = String(net.url || "").trim().replace(/\/+$/, ""), REW = !!net.rewards && !!URL0, BUY = String(net.buyUrl || "").trim(), PRICE = net.price || "$1.99";
  if (/[?&]preview=1/.test(location.search)) { S.preview = true; save(); }
  let PASS = readPass();
  const hasPass = () => !!PASS;
  const isOpen = L => S.preview || ((L === 1 || won(L - 1)) && (L <= FREE || hasPass()));
  const needsPass = L => !S.preview && L > FREE && !hasPass();
  const nextLevel = () => { for (let L = 1; L <= NLV; L++) if (!won(L)) return L; return 0; };
  const headers = L => {
    const h = { "content-type": "application/json" };
    if (window.WISHWELL_ACCESS_CODE) h["x-beta-code"] = window.WISHWELL_ACCESS_CODE;
    const d = deviceId(); if (d) h["x-device-id"] = d;
    if (PASS && (!L || L > FREE)) { h["x-pass-key"] = PASS.key; h["x-pass-email"] = PASS.email; h["x-pass-product"] = PASS.kind; }
    return h;
  };

  root.classList.add("adv");
  root.innerHTML =
    '<canvas class="adv-snow" aria-hidden="true"></canvas>' +
    '<header class="adv-top">' + (opt.backHref ? '<a class="adv-back" href="' + opt.backHref + '">‹ ' + (opt.backLabel || "Back") + '</a>' : '<span style="width:44px"></span>') +
    '<div class="adv-brand"><h1>Holiday Games</h1><p>25 levels up the tree</p></div>' +
    '<div class="adv-tools"><button class="adv-ic" data-music type="button" aria-label="Music">♫</button><button class="adv-ic" data-sound type="button" aria-label="Sound">🔊</button></div></header>' +
    '<main class="adv-main"><p class="adv-note" role="status"></p><div class="adv-tree"></div>' +
    '<section class="adv-pass" data-pass aria-label="Games Pass"></section>' +
    (opt.showPreview !== false ? '<label class="adv-pv"><input type="checkbox" data-pv> Tester preview: open every level now</label>' : '') +
    '<p class="adv-foot">Scores stay on this device. No ads.</p></main>';
  const play = document.createElement("div"); play.className = "adv-play"; play.hidden = true;
  play.innerHTML = '<div class="adv-card" role="dialog" aria-modal="true" aria-labelledby="advT"><div class="adv-chead"><span class="adv-dl"></span><h2 id="advT"></h2>' +
    '<button class="adv-ic" data-sound type="button" aria-label="Sound">🔊</button><button class="adv-x" type="button" aria-label="Back to the tree">×</button></div>' +
    '<div class="adv-stage"><canvas tabindex="0" aria-label="Game area"></canvas><div class="adv-ov"></div></div></div>';
  document.body.appendChild(play);
  const toast = document.createElement("div"); toast.className = "adv-toast"; toast.setAttribute("role", "status"); document.body.appendChild(toast);

  const tree = root.querySelector(".adv-tree"), note = root.querySelector(".adv-note"), passBox = root.querySelector("[data-pass]");
  const card = play.querySelector(".adv-card"), cv = play.querySelector("canvas"), ov = play.querySelector(".adv-ov");
  const g = cv.getContext("2d");

  /* The tree, climbed from the presents underneath (levels 1 to 4) up to the star (level 25) */
  const ROWS = [[23, 24], [20, 21, 22], [16, 17, 18, 19], [11, 12, 13, 14, 15], [5, 6, 7, 8, 9, 10]];
  const drawer = (L, cls) => '<button type="button" class="adv-d ' + cls + '" data-lv="' + L + '"><span class="adv-n">' + L + '</span></button>';
  let html = '<div class="adv-starw">' + drawer(25, "adv-star") + '</div>';
  ROWS.forEach(row => { html += '<div class="adv-tier">' + row.map(L => drawer(L, "c" + (L * 7 % 5))).join("") + '</div>'; });
  html += '<div class="adv-trunk"></div><div class="adv-gifts">' + [1, 2, 3, 4].map(L => drawer(L, "adv-gift g" + L)).join("") + '</div>';
  tree.innerHTML = html;

  function label(btn, L) {
    const best = S.best[L], st = best != null ? starsFor(L, best) : -1;
    let a = "Level " + L + ", " + LV(L).t;
    if (needsPass(L)) a += ", needs the Games Pass"; else if (!isOpen(L)) a += ", win level " + (L - 1) + " to open";
    if (st >= 0) a += ", best " + best + ", " + st + " of 3 stars";
    btn.setAttribute("aria-label", a);
  }
  function refresh() {
    const nx = nextLevel();
    tree.querySelectorAll(".adv-d").forEach(btn => {
      const L = +btn.dataset.lv, open = isOpen(L);
      btn.classList.toggle("adv-lock", !open); btn.classList.toggle("adv-today", L === nx && open);
      btn.classList.toggle("adv-paid", needsPass(L));
      let st = btn.querySelector(".adv-st"); const best = S.best[L];
      if (best != null) { if (!st) { st = document.createElement("span"); st.className = "adv-st"; btn.appendChild(st); } const n = starsFor(L, best); st.textContent = "★".repeat(n) + "☆".repeat(3 - n); }
      label(btn, L);
    });
    if (S.preview) note.innerHTML = "Preview is on: every level opens.";
    else if (!nx) note.innerHTML = "You beat all 25 levels! Merry Christmas!";
    else if (needsPass(nx)) note.innerHTML = "You beat the free levels! The <b>Games Pass</b> opens level " + nx + " and up.";
    else note.innerHTML = "Level <b>" + nx + "</b> is next. Win it to open the one above.";
    const pv = root.querySelector("[data-pv]"); if (pv) pv.checked = !!S.preview;
    document.querySelectorAll("[data-sound]").forEach(b => { b.setAttribute("aria-pressed", S.sound); b.textContent = S.sound ? "🔊" : "🔇"; });
    const mb = root.querySelector("[data-music]"); mb.setAttribute("aria-pressed", S.music && S.sound);
  }

  /* Games Pass box under the tree */
  function renderPass() {
    if (PASS) {
      passBox.innerHTML = '<p class="adv-pon"><b>' + (PASS.kind === "holiday" ? "Your Holiday Pass" : "Games Pass") + ' is on.</b> All 25 levels can open on this device.</p>';
      return;
    }
    passBox.innerHTML = '<h2>Keep climbing</h2><p>Levels 1 to 4 are free. The Games Pass opens levels 5 to 25 for ' + PRICE + ', one time.</p>' +
      (BUY ? '<a class="adv-btn" href="' + BUY.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener" data-count="games_buy">Get the Games Pass ' + PRICE + '</a>'
           : '<button class="adv-btn" type="button" disabled>Games Pass coming soon</button>') +
      (URL0 ? '<details class="adv-key"><summary>I have a key</summary>' +
        '<input type="text" data-k autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="License key" placeholder="Paste your key">' +
        '<input type="email" data-e autocomplete="email" autocapitalize="off" spellcheck="false" aria-label="Email you bought it with" placeholder="Email you bought it with">' +
        '<button class="adv-btn alt" type="button" data-unlock>Unlock</button><p class="adv-kmsg" role="status">A Games Pass or Holiday Pass key works. Use the email you bought it with.</p></details>' : '');
  }
  async function unlock() {
    const kb = passBox.querySelector("[data-k]"), eb = passBox.querySelector("[data-e]"), btn = passBox.querySelector("[data-unlock]"), m = passBox.querySelector(".adv-kmsg");
    const key = kb.value.trim(), email = String(eb.value || "").trim().toLowerCase();
    if (!key) { m.textContent = "Paste your key first."; kb.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { m.textContent = "Type the email you bought it with."; eb.focus(); return; }
    btn.disabled = true; btn.textContent = "Checking...";
    try {
      const r = await fetch(URL0 + "/verify", { method: "POST", headers: headers(0), body: JSON.stringify({ license_key: key, email, product: "games" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.valid) {
        PASS = { key, email, kind: "games" };
        try { localStorage.setItem(PASS_KEY, JSON.stringify(PASS)); } catch (e) {}
        Snd.play("gold"); say("Games Pass unlocked!"); renderPass(); refresh(); return;
      }
      m.textContent = r.status === 429 ? (d.error === "too_many_tries" ? "Too many wrong tries from this network today. Try again tomorrow." : "Couldn't check the key right now. Try again in a minute.")
        : d.reason === "device_limit" ? "This key is already on 3 devices, so it can't be added here."
        : d.reason === "refunded" ? "This pass was refunded, so the key doesn't work anymore."
        : d.reason === "not_set_up" || d.reason === "gumroad_unreachable" ? "Couldn't check the key right now. Try again in a minute."
        : "That key and email don't match a pass. Check both against your receipt.";
    } catch (e) { m.textContent = "Couldn't check the key right now. Check your connection and try again."; }
    btn.disabled = false; btn.textContent = "Unlock";
  }
  passBox.addEventListener("click", e => { if (e.target.closest("[data-unlock]")) unlock(); });
  passBox.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-k],[data-e]")) { e.preventDefault(); unlock(); } });
  const showPass = () => { passBox.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" }); if (!REDUCED) { passBox.classList.remove("adv-wig"); void passBox.offsetWidth; passBox.classList.add("adv-wig"); } };

  /* Bonus AI round for a level's first win. The AI service decides; the browser only asks. */
  async function claim(L) {
    if (!REW || S.preview || S.rew[L]) return null;
    try {
      const r = await fetch(URL0 + "/reward", { method: "POST", headers: headers(L), body: JSON.stringify({ level: L }) });
      if (r.status === 404) return null;
      const d = await r.json().catch(() => ({}));
      if (d.granted) { S.rew[L] = 1; save(); return { got: true, bonus: d.bonus }; }
      if (d.reason === "already") { S.rew[L] = 1; save(); return null; }
      if (d.reason === "daily_limit") return { limit: true };
      return null;
    } catch (e) { return null; }
  }

  let toastT = 0;
  function say(msg) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("show"), 2600); }

  /* Start music on the first tap anywhere (browsers need a tap before sound). */
  const wake = () => { Snd.ensure(); Snd.startMusic(); };
  document.addEventListener("pointerdown", wake, { capture: true });
  document.addEventListener("keydown", wake, { capture: true });
  document.addEventListener("click", wake, { capture: true });

  document.querySelectorAll("[data-sound]").forEach(b => b.addEventListener("click", () => { Snd.setSound(!S.sound); refresh(); }));
  root.querySelector("[data-music]").addEventListener("click", () => { if (!S.sound) { Snd.setSound(true); S.music = true; } else Snd.setMusic(!S.music); save(); Snd.startMusic(); refresh(); });
  const pv = root.querySelector("[data-pv]"); if (pv) pv.addEventListener("change", () => { S.preview = pv.checked; save(); refresh(); });

  tree.addEventListener("click", e => {
    const btn = e.target.closest(".adv-d"); if (!btn) return;
    const L = +btn.dataset.lv;
    if (!isOpen(L)) {
      Snd.play("tok"); if (!REDUCED) { btn.classList.remove("adv-wig"); void btn.offsetWidth; btn.classList.add("adv-wig"); }
      if (!won(L - 1)) say("Win level " + (L - 1) + " to open level " + L + ".");
      else { say("Level " + L + " and up need the Games Pass."); showPass(); }
      return;
    }
    openDay(L, btn);
  });

  /* ---------- Game window ---------- */
  let cur = null, raf = 0, last = 0, scale = 1, shakeT = 0, shakeM = 0, parts = [], floats = [], opener = null, ptrDown = false;
  const api = {
    add(n) { if (cur && cur.state === "play") cur.score = Math.max(0, cur.score + n); },
    set(n) { if (cur && cur.state === "play") cur.score = n; },
    get() { return cur ? cur.score : 0; },
    over() { if (cur && cur.state === "play") endGame(); },
    sfx(n, a) { Snd.play(n, a); },
    shake(m) { if (!REDUCED) { shakeT = 0.25; shakeM = m || 6; } },
    burst(x, y, col, n) { n = REDUCED ? Math.min(3, n || 8) : (n || 8); for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(60, 200); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rnd(0.4, 0.8), max: 0.8, col, r: rnd(2, 4.5) }); } },
    float(x, y, s, col) { floats.push({ x, y, s, col, life: 1 }); }
  };

  function fit() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); scale = cv.width / W;
  }
  window.addEventListener("resize", () => { if (!play.hidden) fit(); });

  function newEngine() { const def = LV(cur.day); cur.eng = ENGINES[def.e](api, def.o); cur.score = 0; cur.t = 0; parts = []; floats = []; }

  function panel(inner) { ov.innerHTML = '<div class="adv-panel">' + inner + '</div>'; ov.hidden = false; const b = ov.querySelector("[data-go]"); if (b) b.focus({ preventScroll: true }); }
  function showReady() {
    const d = cur.day, def = LV(d), best = S.best[d];
    cur.state = "ready";
    panel('<h3>' + def.t + '</h3><p class="adv-how">' + def.how + '</p>' +
      (best != null ? '<p class="adv-sub">Your best: ' + best + ' ' + "★".repeat(starsFor(d, best)) + '</p>' : '<p class="adv-sub">Stars at ' + def.s.join(", ") + ' points</p>') +
      (REW && !S.preview && !S.rew[d] ? '<p class="adv-rw">First win (1 star): +1 bonus AI round</p>' : '') +
      '<div class="adv-btns"><button class="adv-btn" type="button" data-go>Play</button></div>');
  }
  function startGame() {
    Snd.ensure(); Snd.startMusic(); newEngine(); cur.state = "play"; ov.hidden = true; ov.innerHTML = ""; cv.focus({ preventScroll: true });
    if (cur.eng.start) cur.eng.start();
  }
  function endGame() {
    const d = cur.day, sc = cur.score, prev = S.best[d], isBest = prev == null || sc > prev, wasWon = won(d);
    cur.state = "over";
    if (isBest) S.best[d] = sc; S.plays[d] = (S.plays[d] || 0) + 1; save();
    const st = starsFor(d, sc), next = LV(d).s.find(x => sc < x), firstWin = st >= 1 && !wasWon;
    const reward = st >= 1 ? claim(d) : Promise.resolve(null);
    setTimeout(() => { Snd.play(st >= 2 ? "win" : "over"); if (st === 3) Snd.play("sparkle"); }, 120);
    setTimeout(() => {
      if (!cur || cur.state !== "over") return;
      const nL = d + 1, nOpen = nL <= NLV && isOpen(nL);
      let line = "", btns = "";
      if (firstWin && nL <= NLV) line = nOpen ? "Level " + nL + " is open!" : needsPass(nL) ? "You beat the free levels! Level " + nL + " and up need the Games Pass." : "";
      else if (firstWin) line = "You beat the whole tree!";
      if (st >= 1 && nOpen) btns += '<button class="adv-btn" type="button" data-next>Next level</button><button class="adv-btn alt" type="button" data-go>Play again</button>';
      else if (st >= 1 && nL <= NLV && needsPass(nL)) btns += '<button class="adv-btn" type="button" data-passgo>See the Games Pass</button><button class="adv-btn alt" type="button" data-go>Play again</button>';
      else btns += '<button class="adv-btn" type="button" data-go>Play again</button>';
      btns += '<button class="adv-btn alt" type="button" data-close>Back to the tree</button>';
      panel('<h3>' + ["Good try!", "Nice!", "Great job!", "Superstar!"][st] + '</h3><div class="adv-big">' + sc + '</div>' +
        (isBest && prev != null ? '<div class="adv-new">New best!</div>' : '') +
        '<div class="adv-ps" aria-label="' + st + ' of 3 stars">' + [0, 1, 2].map(i => '<span class="' + (i < st ? "on" : "") + '">★</span>').join("") + '</div>' +
        '<p class="adv-sub">' + (st < 1 ? "Get 1 star (" + LV(d).s[0] + " points) to win" : next != null ? "Next star at " + next : "All 3 stars!") + (prev != null && !isBest ? " · Best " + prev : "") + '</p>' +
        (line ? '<p class="adv-lvl">' + line + '</p>' : '') + '<p class="adv-rw" data-rw hidden></p>' +
        '<div class="adv-btns">' + btns + '</div>');
      const here = cur;
      reward.then(r => {
        if (!r || cur !== here || cur.state !== "over") return;
        const el = ov.querySelector("[data-rw]"); if (!el) return;
        if (r.got) { el.textContent = "+1 bonus AI round for gift ideas!" + (r.bonus > 1 ? " You have " + r.bonus + " saved up." : ""); Snd.play("gold"); }
        else if (r.limit) el.textContent = "You've earned today's bonus AI rounds. More tomorrow.";
        el.hidden = false;
      });
      refresh();
    }, 650);
  }
  ov.addEventListener("click", e => {
    if (e.target.closest("[data-next]") && cur) { const L = cur.day + 1; closeDay(); const b = tree.querySelector('[data-lv="' + L + '"]'); if (b) setTimeout(() => openDay(L, b), REDUCED ? 0 : 120); }
    else if (e.target.closest("[data-passgo]")) { closeDay(); setTimeout(showPass, 60); }
  });
  ov.addEventListener("click", e => {
    if (e.target.closest("[data-go]")) startGame();
    else if (e.target.closest("[data-close]")) closeDay();
  });

  function openDay(d, btn) {
    opener = btn; cur = { day: d, state: "ready", score: 0, t: 0 };
    play.querySelector(".adv-dl").textContent = "Level " + d; play.querySelector("#advT").textContent = LV(d).t;
    Snd.play("whoosh");
    const go = () => {
      play.hidden = false; fit(); newEngine(); showReady();
      if (!REDUCED) {
        const a = btn.getBoundingClientRect(), b = card.getBoundingClientRect();
        card.style.transition = "none"; card.style.opacity = "0.4";
        card.style.transform = "translate(" + (a.left + a.width / 2 - (b.left + b.width / 2)) + "px," + (a.top + a.height / 2 - (b.top + b.height / 2)) + "px) scale(" + Math.max(0.08, a.width / b.width) + ")";
        void card.offsetWidth; card.style.transition = ""; card.style.opacity = "1"; card.style.transform = "none";
      }
      last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      document.documentElement.style.overflow = "hidden";
    };
    if (REDUCED) go(); else { btn.classList.add("adv-out"); setTimeout(go, 230); }
  }
  function closeDay() {
    if (!cur) return;
    cur = null; cancelAnimationFrame(raf); play.hidden = true; ov.innerHTML = ""; document.documentElement.style.overflow = "";
    if (opener) { opener.classList.remove("adv-out"); opener.focus({ preventScroll: true }); }
    refresh();
  }
  play.querySelector(".adv-x").addEventListener("click", closeDay);
  play.addEventListener("click", e => { if (e.target === play) closeDay(); });

  function toLocal(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
  cv.addEventListener("pointerdown", e => {
    e.preventDefault(); ptrDown = true; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    if (cur && cur.state === "play") { const [x, y] = toLocal(e); cur.eng.down(x, y); }
  });
  cv.addEventListener("pointermove", e => { if (cur && cur.state === "play" && cur.eng.move) { const [x, y] = toLocal(e); cur.eng.move(x, y, ptrDown, e.pointerType === "mouse"); } });
  const up = () => { ptrDown = false; if (cur && cur.eng && cur.eng.up) cur.eng.up(); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    if (play.hidden || !cur) return;
    if (e.key === "Escape") { closeDay(); return; }
    if (cur.state !== "play") return;
    const handled = cur.eng.key && cur.eng.key(e.key, true);
    if (handled) { e.preventDefault(); return; }
    if ((e.key === " " || e.key === "Enter" || e.key === "ArrowUp") && !e.repeat) { e.preventDefault(); cur.eng.down(W / 2, H / 2); }
  });
  document.addEventListener("keyup", e => { if (cur && cur.state === "play" && cur.eng.key) cur.eng.key(e.key, false); });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      Snd.suspend();
      if (cur && cur.state === "play") { cur.state = "paused"; panel('<h3>Paused</h3><p class="adv-sub">Score so far: ' + cur.score + '</p><div class="adv-btns"><button class="adv-btn" type="button" data-resume>Keep playing</button></div>'); }
    } else Snd.resume();
  });
  ov.addEventListener("click", e => { if (e.target.closest("[data-resume]") && cur) { cur.state = "play"; ov.hidden = true; ov.innerHTML = ""; last = 0; cv.focus({ preventScroll: true }); } });

  function frame(ts) {
    if (!cur) return;
    raf = requestAnimationFrame(frame);
    const now = ts / 1000, dt = last ? Math.min(0.05, now - last) : 0; last = now;
    if (cur.state === "play") { cur.t += dt; cur.eng.update(dt, cur.t); }
    if (!cur) return;
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const f of floats) { f.y -= 36 * dt; f.life -= dt * 1.1; }
    floats = floats.filter(f => f.life > 0);
    if (shakeT > 0) shakeT -= dt;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (shakeT > 0) g.translate(rnd(-1, 1) * shakeM * shakeT * 4, rnd(-1, 1) * shakeM * shakeT * 4);
    g.lineJoin = "round"; g.lineCap = "butt";
    cur.eng.draw(g, now);
    for (const p of parts) { g.globalAlpha = clamp(p.life / p.max * 1.4, 0, 1); dot(g, p.x, p.y, p.r, p.col); }
    g.globalAlpha = 1;
    for (const f of floats) { g.globalAlpha = clamp(f.life * 1.6, 0, 1); text(g, f.s, f.x, f.y, 20, f.col, "center", INK); }
    g.globalAlpha = 1;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (cur.state !== "ready") {
      g.font = "900 22px Nunito, system-ui, sans-serif"; const sw = Math.max(54, g.measureText(String(cur.score)).width + 26);
      rr(g, 10, 10, sw, 36, 18); g.fillStyle = "rgba(35,40,77,.78)"; g.fill(); text(g, String(cur.score), 10 + sw / 2, 29, 22, C.gold);
      const h = cur.eng.hud && cur.eng.hud();
      if (h) { g.font = "900 20px Nunito, system-ui, sans-serif"; const hw = g.measureText(h).width + 24; rr(g, W - 10 - hw, 10, hw, 36, 18); g.fillStyle = "rgba(35,40,77,.78)"; g.fill(); text(g, h, W - 10 - hw / 2, 29, 20, h.indexOf("♥") >= 0 || h.indexOf("♡") >= 0 ? "#ff8a80" : "#fff"); }
    }
  }

  /* Gentle snowfall behind the tree */
  if (!REDUCED) {
    const sc = root.querySelector(".adv-snow"), sg = sc.getContext("2d"); let flakes = [], sw = 0, sh = 0;
    const size = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); sw = innerWidth; sh = innerHeight; sc.width = sw * dpr; sc.height = sh * dpr; sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = Array.from({ length: Math.round(sw * sh / 9000) }, () => ({ x: Math.random() * sw, y: Math.random() * sh, r: rnd(1, 3), v: rnd(14, 40), p: rnd(0, TAU) })); };
    size(); window.addEventListener("resize", size);
    let lt = 0;
    const snow = ts => {
      requestAnimationFrame(snow); if (!play.hidden || document.hidden) { lt = 0; return; }
      const dt = lt ? Math.min(0.05, (ts - lt) / 1000) : 0; lt = ts; sg.clearRect(0, 0, sw, sh); sg.fillStyle = "rgba(255,255,255,.75)";
      for (const f of flakes) { f.y += f.v * dt; f.x += Math.sin(ts / 1000 + f.p) * 8 * dt; if (f.y > sh + 4) { f.y = -4; f.x = Math.random() * sw; } sg.beginPath(); sg.arc(f.x, f.y, f.r, 0, TAU); sg.fill(); }
    };
    requestAnimationFrame(snow);
  }

  renderPass(); refresh();
  /* Fonts may load after first paint; nothing on the tree depends on them, but game text does. */
  return { refresh, open: L => openDay(L, tree.querySelector('[data-lv="' + L + '"]')) };
}

window.WishwellAdvent = { mount, days: DAYS, order: ORDER, engines: ENGINES };
})();
