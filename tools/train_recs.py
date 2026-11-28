#!/usr/bin/env python3
"""Train Wishwell's idea recommender from the anonymous round log. Plain Python 3, no installs.

1. Export the log (one row per idea shown) from D1, on any computer with Node:
     npx wrangler d1 execute wishwell-ideas --remote --json --command "SELECT r.list_id, r.round, r.for_who, r.age, r.style, r.budget, r.ints, r.quiz, i.title, i.category, i.src, i.outcome FROM rounds r JOIN round_ideas i ON i.list_id = r.list_id AND i.round = r.round" > rounds.json
   (or save the same query's results from the D1 console as a CSV file).
2. Train:   python3 tools/train_recs.py rounds.json
3. It writes app/recs.json. Commit it and the website and app load it on their next update.

The model is logistic regression: it learns how much each feature pushes an idea toward being
circled. Features are the idea's kind and title words, crossed with the quiz answers, interests,
who it's for, age and budget. Circled or starred = 1 (starred counts double), cut = 0, shown and
left alone = 0 with a small weight, "have it" is skipped. People are split into train and test by
list, so the test score shows how it does on people it never saw. See
developers.google.com/machine-learning/crash-course/logistic-regression for how it works.
"""
import csv, json, math, random, re, sys, os
from datetime import date

def words(title):
    out = []
    for w in re.split(r"[^a-z0-9]+", str(title).lower()):
        if len(w) <= 2 or w in SKIP: continue
        if len(w) > 4 and w.endswith("ies"): w = w[:-3] + "y"
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"): w = w[:-1]
        out.append(w)
    return sorted(set(out))
SKIP = set("and the for with set kit pack bundle collection gift gifts mini small large big little personalized custom customized diy premium deluxe smart portable sampler starter holder stand organizer".split())

def features(ctx, title, cat):
    """Must match recFeatures() in app/index.html."""
    ws = words(title)
    f = ["cat=" + cat] + ["w=" + w for w in ws]
    tags = ["fw=" + (ctx.get("fw") or "me"), "budget=" + (ctx.get("budget") or "any")]
    if ctx.get("age"): tags.append("age=" + ctx["age"])
    if ctx.get("style"): tags.append("style=" + ctx["style"])
    tags += ["q=" + q for q in ctx.get("quiz", [])] + ["int=" + i for i in ctx.get("ints", [])]
    for t in tags:
        f.append(t + "|cat=" + cat)
    for t in ["int=" + i for i in ctx.get("ints", [])] + ["q=" + q for q in ctx.get("quiz", [])]:
        for w in ws: f.append(t + "|w=" + w)
    return f

def load(path):
    if path.endswith(".csv"):
        with open(path, newline="", encoding="utf-8") as fh: return list(csv.DictReader(fh))
    data = json.load(open(path, encoding="utf-8"))
    if isinstance(data, list) and data and isinstance(data[0], dict) and "results" in data[0]:
        rows = []
        for part in data: rows += part["results"]
        return rows
    return data

def example(r):
    o = r.get("outcome", "none")
    if o == "have": return None
    y, wt = {"top": (1, 2.0), "kept": (1, 1.0), "cut": (0, 1.0), "none": (0, 0.3)}.get(o, (0, 0.3))
    if r.get("backfill"): wt *= 0.5   # shared later; its quiz answers may be newer than the round
    j = lambda v: json.loads(v) if isinstance(v, str) and v.startswith("[") else (v or [])
    ctx = {"fw": r.get("for_who"), "age": r.get("age"), "style": r.get("style"), "budget": r.get("budget"),
           "ints": j(r.get("ints")), "quiz": j(r.get("quiz"))}
    return features(ctx, r["title"], r["category"]), y, wt, r["list_id"]

def train(ex, epochs=12, lr=0.08, l2=1e-3):
    w, b = {}, 0.0
    for e in range(epochs):
        random.shuffle(ex)
        for f, y, wt, _ in ex:
            z = b + sum(w.get(k, 0.0) for k in f)
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            g = (p - y) * wt
            b -= lr * g
            for k in f: w[k] = w.get(k, 0.0) - lr * (g + l2 * w.get(k, 0.0))
    return w, b

def auc(ex, w, b):
    s = [(b + sum(w.get(k, 0.0) for k in f), y) for f, y, wt, _ in ex if wt >= 1]
    pos = [x for x, y in s if y == 1]; neg = [x for x, y in s if y == 0]
    if not pos or not neg: return None
    win = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return win / (len(pos) * len(neg))

def main():
    if len(sys.argv) < 2: sys.exit("usage: python3 tools/train_recs.py rounds.json [out.json]")
    rows = load(sys.argv[1])
    ex = [e for e in (example(r) for r in rows) if e]
    lists = sorted({e[3] for e in ex})
    random.seed(7); random.shuffle(lists)
    test_ids = set(lists[: max(1, len(lists) // 5)])
    tr = [e for e in ex if e[3] not in test_ids]; te = [e for e in ex if e[3] in test_ids]
    print(f"{len(rows)} ideas shown, {len(ex)} used, {len(lists)} lists ({len(test_ids)} held out for testing)")
    w, b = train(tr)
    a = auc(te, w, b)
    print("test AUC:", "n/a (need both circles and cuts in the test lists)" if a is None else f"{a:.3f}  (0.5 = guessing, 1.0 = perfect)")
    w, b = train(ex)   # final model uses everything
    keep = {k: round(v, 4) for k, v in sorted(w.items(), key=lambda kv: -abs(kv[1]))[:4000] if abs(v) >= 0.01}
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "app", "recs.json")
    json.dump({"version": 1, "trained": date.today().isoformat(), "n": len(ex), "lists": len(lists),
               "auc": None if a is None else round(a, 3), "bias": round(b, 4), "w": keep}, open(out, "w"), separators=(",", ":"))
    print(f"wrote {len(keep)} weights to {os.path.normpath(out)}")
    for k, v in sorted(keep.items(), key=lambda kv: -kv[1])[:12]: print(f"  + {v:6.3f}  {k}")
    for k, v in sorted(keep.items(), key=lambda kv: kv[1])[:12]: print(f"  - {v:6.3f}  {k}")

if __name__ == "__main__":
    main()
