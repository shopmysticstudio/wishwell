#!/usr/bin/env python3
"""Wishwell test model: learns which shown ideas people keep, from the anonymous round log.

This is a first test. Nothing in the app or the Worker reads its output yet.

Input (not in the repo, since the repo is public): two pipe-separated files exported from the
D1 database wishwell-ideas with the queries in ml/README.md.
  rows.txt      list|round|pos|category|src|lo|hi|outcome|title   (one shown idea per line)
  profiles.txt  list|for_who|age|lean|style|budget|ints_json|quiz_json|has_details

Labels: kept = 1, top (starred on the Rank list) = 1 with double weight, cut = 0.
"have" (they already own it) says nothing about taste, so those rows are left out.
Ideas nobody touched are left out too.

Evaluation holds out one person at a time (lists with the same quiz answers count as one
person, and lists that are copies of another list are dropped), and compares against
  - pos:   the order the ideas were shown in (what the app does for AI ideas today)
  - rules: the app's starter-idea score from app/index.html (interests, quiz, style, age,
           crowd category nudges, gendered and niche filters), copied by ml/export_rules.mjs

Usage: python3 ml/train.py --rows /path/rows.txt --profiles /path/profiles.txt [--out ml]
"""
import argparse, json, math, os, re, sys
from collections import defaultdict

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
CATS = ["Tech", "Gaming", "Making", "Art", "Music", "Sports", "Outdoors", "Science", "Books", "Food",
        "Style", "Room", "Experiences", "Beauty", "Other"]
SRCS = {"a": "ai", "r": "crowd", "s": "starter"}
AGES = ["teen", "young", "adult", "mid", "older"]
STYLES = ["Practical", "Wow factor", "Cozy", "Surprise me"]
BUDGETS = ["25", "75", "200", "9999", "any"]


def stem(w):
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def words(text):
    return {stem(w) for w in re.split(r"[^a-z0-9]+", text.lower()) if w}


def key(title):
    return " ".join(sorted(words(title)))


# ---------- loading ----------

def load(rows_path, prof_path):
    prof = {}
    for line in open(prof_path, encoding="utf8"):
        p = line.rstrip("\n").split("|")
        if len(p) < 9:
            continue
        prof[p[0]] = dict(for_who=p[1], age=p[2], lean=p[3], style=p[4], budget=p[5],
                          ints=json.loads(p[6]), quiz=dict(q.split("=") for q in json.loads(p[7])),
                          details=int(p[8]))
    rows = []
    for line in open(rows_path, encoding="utf8"):
        p = line.rstrip("\n").split("|", 8)
        if len(p) < 9 or p[0] not in prof:
            continue
        rows.append(dict(list=p[0], round=int(p[1]), pos=int(p[2]), cat=p[3], src=SRCS.get(p[4], p[4]),
                         lo=int(p[5]), hi=int(p[6]), out=p[7], title=p[8]))
    return rows, prof


def person_of(prof):
    """Lists with the same quiz answers and profile are treated as one person."""
    sig = {}
    for lid, p in prof.items():
        s = json.dumps([p["for_who"], p["age"], p["lean"], p["style"], p["budget"], sorted(p["ints"]),
                        sorted(p["quiz"].items())])
        sig[lid] = s
    names = {s: "p%d" % i for i, s in enumerate(sorted(set(sig.values())))}
    return {lid: names[s] for lid, s in sig.items()}


def drop_copies(rows, person):
    """Some lists are re-logged copies of another list (same person, same rounds, same picks)."""
    by = defaultdict(set)
    for r in rows:
        by[r["list"]].add((r["round"], r["pos"], r["title"], r["out"]))
    lists = sorted(by, key=lambda l: (-len(by[l]), l))
    drop = set()
    for i, b in enumerate(lists):
        for a in lists[:i]:
            if a not in drop and person[a] == person[b] and by[b] <= by[a]:
                drop.add(b)
                break
    return [r for r in rows if r["list"] not in drop], sorted(drop)


# ---------- the app's current rule score ----------

class Rules:
    def __init__(self, path):
        j = json.load(open(path, encoding="utf8"))
        self.ints = {n: words(t) for n, t in j["ints"]}
        self.pairs = j["pairs"]
        self.cat2int = j["cat2int"]
        self.crowd = j["crowd_cat"]
        self.age = {k: (words(v[0]), words(v[1])) for k, v in j["age_fit"].items()}
        self.niche = re.compile(j["niche_re"])
        self.gen = re.compile(j["gen_re"])
        self.fem = re.compile(j["fem_re"])
        self.masc = re.compile(j["masc_re"])
        self.sb = j["style_bonus"]

    def signals(self, p):
        sig = []
        for n in p["ints"]:
            if n in self.ints:
                sig.append((n, 2, self.ints[n]))
        for pr in self.pairs:
            k = p["quiz"].get(pr["id"])
            if k is None:
                continue
            opts = pr["o"] if k == "2" else ([pr["o"][int(k)]] if int(k) < len(pr["o"]) else [])
            for o in opts:
                sig.append((self.cat2int.get(o["cat"]) or o["cat"], 3, words(o["words"])))
        return sig

    def score(self, r, p):
        iw = words(r["title"] + " " + r["cat"])
        hit = {}
        for k, w, s in self.signals(p):
            if iw & s:
                hit[k] = max(hit.get(k, 0), w)
        sc = sum(hit.values()) + (3 * (len(hit) - 1) if len(hit) > 1 else 0)
        if r["cat"] in self.sb.get(p["style"], []):
            sc += 2
        a = self.age.get(p["age"])
        if a:
            sc += -4 if iw & a[1] else min(3, 1.5 * len(iw & a[0]))
        sc += self.crowd.get(r["cat"], 0)
        tx = r["title"].lower()
        asked = (r["cat"] == "Beauty" and any(i in ("Beauty", "Self-care") for i in p["ints"])) or \
                (re.search(r"jewel|necklace|earring|bracelet", tx) and "Jewelry" in p["ints"])
        if self.gen.search(tx):
            if (p["lean"] == "fem" and self.fem.search(tx)) or (p["lean"] == "masc" and self.masc.search(tx)):
                sc += 1
            elif not asked:
                sc -= 50
        elif (r["cat"] == "Science" or self.niche.search(tx)) and not any(
                i in ("Tech", "Making", "Space and science") for i in p["ints"]):
            sc -= 50
        if p["style"] == "Wow factor" and r["hi"] >= 200:
            sc += 1
        return sc


# ---------- features ----------

def popularity(rows_from, smooth=2.0):
    """Kept rate per idea and per category, from the rows given (other people only)."""
    tot = sum(r["y"] for r in rows_from) / max(1, len(rows_from))
    ik, ck = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    for r in rows_from:
        ik[key(r["title"])][0] += r["y"]; ik[key(r["title"])][1] += 1
        ck[r["cat"]][0] += r["y"]; ck[r["cat"]][1] += 1
    f = lambda d, k: ((d[k][0] + smooth * tot) / (d[k][1] + smooth), d[k][1]) if k in d else (tot, 0)
    return lambda r: f(ik, key(r["title"])) + f(ck, r["cat"])[:1]


def feature_names():
    n = ["cat=" + c for c in CATS] + ["src=" + s for s in SRCS.values()]
    n += ["log_lo", "log_hi", "over_budget", "pos", "pos_rel", "round"]
    n += ["for_them", "lean_fem", "lean_masc", "details"] + ["age=" + a for a in AGES]
    n += ["style=" + s for s in STYLES] + ["budget=" + b for b in BUDGETS]
    n += ["cat_in_interests", "interest_word_hits", "rule_score"]
    n += ["idea_pop", "idea_seen_by_others", "cat_pop"]
    return n


def featurize(r, p, rules, pop, maxpos):
    budget = 1e9 if p["budget"] in ("any", "9999") else float(p["budget"])
    iw = words(r["title"] + " " + r["cat"])
    hits = sum(1 for n in p["ints"] if n in rules.ints and iw & rules.ints[n])
    ip, iseen, cp = pop(r)
    x = [float(r["cat"] == c) for c in CATS] + [float(r["src"] == s) for s in SRCS.values()]
    x += [math.log1p(r["lo"]), math.log1p(r["hi"]), float(r["lo"] > budget), r["pos"],
          r["pos"] / max(1, maxpos), r["round"]]
    x += [float(p["for_who"] == "them"), float(p["lean"] == "fem"), float(p["lean"] == "masc"), p["details"]]
    x += [float(p["age"] == a) for a in AGES] + [float(p["style"] == s) for s in STYLES]
    x += [float(p["budget"] == b) for b in BUDGETS]
    x += [float(rules.cat2int.get(r["cat"]) in p["ints"]), hits, max(-10.0, rules.score(r, p))]
    x += [ip, math.log1p(iseen), cp]
    return x


def matrix(rows, prof, rules, pop_rows_for):
    maxpos = defaultdict(int)
    for r in rows:
        k = (r["list"], r["round"]); maxpos[k] = max(maxpos[k], r["pos"])
    X = []
    for r in rows:
        pop = pop_rows_for(r)
        X.append(featurize(r, prof[r["list"]], rules, pop, maxpos[(r["list"], r["round"])]))
    return np.array(X, dtype=float)


# ---------- metrics ----------

def top3(rows, scores):
    """Share of the top 3 ideas (by score) in each round that the person kept, averaged per person."""
    by = defaultdict(list)
    for r, s in zip(rows, scores):
        by[(r["person"], r["list"], r["round"])].append((s, r["pos"], r["y"]))
    per = defaultdict(list)
    for (person, _, _), items in by.items():
        if len(items) < 4 or not any(y for _, _, y in items) or all(y for _, _, y in items):
            continue
        items.sort(key=lambda t: (-t[0], t[1]))
        per[person].append(sum(y for _, _, y in items[:3]) / 3)
    rounds = [v for vs in per.values() for v in vs]
    return (float(np.mean(rounds)) if rounds else float("nan"),
            float(np.mean([np.mean(v) for v in per.values()])) if per else float("nan"), len(rounds))


def auc(y, s):
    return float(roc_auc_score(y, s)) if len(set(y)) > 1 else float("nan")


# ---------- training ----------

def make_models():
    return {
        "logistic": lambda: (StandardScaler(), LogisticRegression(C=0.3, max_iter=2000)),
        "boosted": lambda: (None, HistGradientBoostingClassifier(max_depth=3, max_iter=120, learning_rate=0.05,
                                                                  min_samples_leaf=12, l2_regularization=1.0,
                                                                  random_state=0)),
    }


def fit(spec, X, y, w):
    sc, m = spec()
    Xs = sc.fit_transform(X) if sc else X
    m.fit(Xs, y, sample_weight=w)
    return sc, m


def predict(sc, m, X):
    return m.predict_proba(sc.transform(X) if sc else X)[:, 1]


def pop_for(train_rows):
    """Popularity for a row is computed from training rows of other people only (no leakage)."""
    by_person = defaultdict(list)
    for r in train_rows:
        by_person[r["person"]].append(r)
    cache = {}
    def get(r):
        if r["person"] not in cache:
            cache[r["person"]] = popularity([t for t in train_rows if t["person"] != r["person"]])
        return cache[r["person"]]
    return get


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", required=True)
    ap.add_argument("--profiles", required=True)
    ap.add_argument("--rules", default=os.path.join(HERE, "rules.json"))
    ap.add_argument("--out", default=HERE)
    a = ap.parse_args()

    rows, prof = load(a.rows, a.profiles)
    rules = Rules(a.rules)
    person = person_of(prof)
    rows, dropped = drop_copies(rows, person)
    have = sum(1 for r in rows if r["out"] == "h")
    rows = [r for r in rows if r["out"] in ("k", "t", "c")]
    for r in rows:
        r["person"] = person[r["list"]]
        r["y"] = int(r["out"] in ("k", "t"))
        r["w"] = 2.0 if r["out"] == "t" else 1.0
    people = sorted({r["person"] for r in rows})
    y = np.array([r["y"] for r in rows]); w = np.array([r["w"] for r in rows])
    print("rows %d (kept or starred %d, cut %d), %d 'have' rows left out, %d people, %d lists, copies dropped: %s"
          % (len(rows), y.sum(), len(y) - y.sum(), have, len(people), len({r["list"] for r in rows}),
             ", ".join(dropped) or "none"))
    print("rows per person:", {p: sum(1 for r in rows if r["person"] == p) for p in people})

    names = feature_names()
    rule_ix = names.index("rule_score")
    specs = make_models()
    held = {k: np.zeros(len(rows)) for k in list(specs) + ["pos", "rules", "random"]}
    rng = np.random.default_rng(0)
    perm_drop = {k: defaultdict(list) for k in specs}
    curve = defaultdict(list)
    for hp in people:
        tr = [i for i, r in enumerate(rows) if r["person"] != hp]
        te = [i for i, r in enumerate(rows) if r["person"] == hp]
        trr = [rows[i] for i in tr]
        Xtr = matrix(trr, prof, rules, pop_for(trr))
        trpop = popularity(trr)
        Xte = matrix([rows[i] for i in te], prof, rules, lambda r: trpop)
        held["pos"][te] = [-rows[i]["pos"] for i in te]
        held["rules"][te] = Xte[:, rule_ix]
        held["random"][te] = rng.random(len(te))
        for k, spec in specs.items():
            sc, m = fit(spec, Xtr, y[tr], w[tr])
            p = predict(sc, m, Xte)
            held[k][te] = p
            if len(set(y[te])) > 1:
                base = auc(y[te], p)
                for j, n in enumerate(names):
                    Xp = Xte.copy(); Xp[:, j] = rng.permutation(Xp[:, j])
                    perm_drop[k][n].append((base - auc(y[te], predict(sc, m, Xp))) * len(te))
        # learning curve: same held-out person, less training data
        for frac in (0.25, 0.5, 0.75, 1.0):
            if len(set(y[te])) < 2:
                continue
            scores = []
            for seed in range(5):
                r2 = np.random.default_rng(seed)
                sub = [i for i in tr if r2.random() < frac] if frac < 1 else tr
                if len(set(y[sub])) < 2:
                    continue
                sr = [rows[i] for i in sub]
                sc, m = fit(specs["logistic"], matrix(sr, prof, rules, pop_for(sr)), y[sub], w[sub])
                sp = popularity(sr)
                scores.append(auc(y[te], predict(sc, m, matrix([rows[i] for i in te], prof, rules, lambda r: sp))))
                if frac == 1:
                    break
            curve[frac].append((np.mean(scores), len(te), int(len(tr) * frac)))

    report = {"rows": len(rows), "kept_or_top": int(y.sum()), "cut": int(len(y) - y.sum()), "have_left_out": have,
              "people": len(people), "copy_lists_dropped": len(dropped), "methods": {}}
    print("\nHeld out one person at a time:")
    print("%-9s %8s %10s %14s" % ("method", "AUC", "top-3 hit", "top-3/person"))
    for k in ["random", "pos", "rules"] + list(specs):
        t3, t3p, nr = top3(rows, held[k])
        per_auc = [auc(y[[i for i, r in enumerate(rows) if r["person"] == p]],
                       held[k][[i for i, r in enumerate(rows) if r["person"] == p]]) for p in people]
        per_auc = [v for v in per_auc if not math.isnan(v)]
        report["methods"][k] = {"auc_pooled": auc(y, held[k]), "auc_mean_per_person": float(np.mean(per_auc)),
                                "top3_hit_rate": t3, "top3_per_person": t3p, "rounds_scored": nr}
        print("%-9s %8.3f %10.3f %14.3f   (per-person AUC %.3f, %d rounds)" % (
            k, auc(y, held[k]), t3, t3p, np.mean(per_auc), nr))
    print("base rate (share kept): %.3f" % y.mean())
    report["base_rate"] = float(y.mean())

    report["importance"] = {}
    for k in specs:
        imp = sorted(((sum(v) / len(rows), n) for n, v in perm_drop[k].items()), reverse=True)
        report["importance"][k] = [[n, round(v, 4)] for v, n in imp[:12]]
        print("\n%s: features that matter most (AUC lost when shuffled)" % k)
        for v, n in imp[:8]:
            print("  %-22s %+.3f" % (n, v))

    report["learning_curve"] = {}
    print("\nLearning curve (logistic, held-out AUC vs share of training data):")
    for frac in sorted(curve):
        vals = curve[frac]
        wa = sum(a * n for a, n, _ in vals) / sum(n for _, n, _ in vals)
        rowsn = int(np.mean([t for _, _, t in vals]))
        report["learning_curve"][str(frac)] = {"auc": wa, "train_rows": rowsn}
        print("  %3d%%  ~%d rows  AUC %.3f" % (frac * 100, rowsn, wa))

    # final model on everything (popularity is not stored: at scoring time it comes from the live pool)
    X = matrix(rows, prof, rules, pop_for(rows))
    sc, lr = fit(specs["logistic"], X, y, w)
    _, gb = fit(specs["boosted"], X, y, w)
    model = {"note": "Wishwell test model, not used by the app. Trained by ml/train.py.",
             "features": names, "mean": sc.mean_.tolist(), "scale": sc.scale_.tolist(),
             "coef": lr.coef_[0].tolist(), "intercept": float(lr.intercept_[0]),
             "trained_rows": len(rows), "trained_people": len(people)}
    json.dump(model, open(os.path.join(a.out, "model.json"), "w"), indent=1)
    import joblib
    joblib.dump({"features": names, "model": gb}, os.path.join(a.out, "model_boosted.joblib"))
    json.dump(report, open(os.path.join(a.out, "report.json"), "w"), indent=1)
    top = sorted(zip(lr.coef_[0], names), key=lambda t: -abs(t[0]))[:10]
    print("\nlogistic weights (scaled), strongest:")
    for c, n in top:
        print("  %-22s %+.2f" % (n, c))
    print("\nwrote model.json, model_boosted.joblib, report.json to", a.out)


if __name__ == "__main__":
    sys.exit(main())
