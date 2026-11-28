// Copies the rule-score inputs (interest words, quiz words, age fit, crowd nudges, filters) out of
// app/index.html into ml/rules.json, so ml/train.py scores ideas the same way the app does.
// Run from the repo root: node ml/export_rules.mjs
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("app/index.html", "utf8");
function grab(name) {
  const i = src.indexOf("const " + name + "=");
  if (i < 0) throw new Error("missing " + name);
  const start = i + ("const " + name + "=").length;
  if (src[start] === "/") return src.slice(start, src.indexOf("\n", start)).replace(/;\s*$/, "");
  let depth = 0, j = start;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(start, j);
}
const val = s => Function('"use strict";return (' + s + ")")();
const re = s => val(s).source;
const pairs = val(grab("PAIRS")).map(p => ({ id: p.id, o: p.o.map(o => ({ words: o[2], cat: o[3] })) }));
const out = {
  note: "Copied from app/index.html by ml/export_rules.mjs. Do not edit by hand.",
  ints: val(grab("INTS")), pairs, cat2int: val(grab("CAT2INT")),
  crowd_cat: val(grab("CROWD_CAT")), age_fit: val(grab("AGE_FIT")),
  niche_re: re(grab("NICHE_RE")), gen_re: re(grab("GEN_RE")), fem_re: re(grab("FEM_RE")), masc_re: re(grab("MASC_RE")),
  style_bonus: { Practical: ["Food", "Room", "Sports", "Other"], "Wow factor": ["Experiences", "Style", "Tech"], Cozy: ["Room", "Food", "Books"], "Surprise me": ["Experiences", "Other", "Art"] }
};
writeFileSync("ml/rules.json", JSON.stringify(out, null, 1) + "\n");
console.log("wrote ml/rules.json", Object.keys(out).join(" "));
