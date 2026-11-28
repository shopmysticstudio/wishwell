#!/usr/bin/env python3
"""Run one gift profile through Wishwell's AI as a test run: nothing is saved (no rounds, no picks,
nothing added to the idea pool). Needs the beta code in WISHWELL_BETA_CODE.

    WISHWELL_BETA_CODE=... python3 .github/try_ideas.py --age adult --lean fem \
        --ints "Music,Coffee and tea" --budget 25 --notes "37, mom to a 6 year old, likes purple"

age: teen (13-17), young (18-29), adult (30-44), mid (45-59), older (60+)
lean: neutral, fem, masc      budget: 25, 75, 200, 9999 ($200 and up), any
Each idea is marked "ai" or "crowd" (it matches something other people kept).
"""
import argparse, json, os, sys, urllib.request, urllib.error

API = "https://wishwell-ai-ideas.shopmysticstudio.workers.dev/"
p = argparse.ArgumentParser()
p.add_argument("--who", default="them", choices=["them", "me"])
p.add_argument("--age", default="", choices=["", "teen", "young", "adult", "mid", "older"])
p.add_argument("--lean", default="", choices=["", "neutral", "fem", "masc"])
p.add_argument("--ints", default="", help="comma list, from the quiz's interests")
p.add_argument("--budget", default="any", choices=["25", "75", "200", "9999", "any"])
p.add_argument("--style", default="", help="Practical, Wow factor, Cozy or Surprise me")
p.add_argument("--notes", default="", help="details, no names (max 400 characters)")
p.add_argument("--n", type=int, default=8)
p.add_argument("--no-crowd", action="store_true", help="leave out what other people kept and cut")
p.add_argument("--json", action="store_true", help="print the raw answer too")
a = p.parse_args()
code = os.environ.get("WISHWELL_BETA_CODE", "").strip()
if not code:
    sys.exit("Set WISHWELL_BETA_CODE to the beta code.")
body = {"dry": True, "crowd": not a.no_crowd, "n": a.n, "forWho": a.who, "age": a.age, "lean": a.lean,
        "ints": [s.strip() for s in a.ints.split(",") if s.strip()], "budget": a.budget, "style": a.style,
        "notes": a.notes, "quiz": [], "kept": [], "top": [], "keptAi": [], "cut": [], "seen": []}
req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST", headers={
    "content-type": "application/json", "x-beta-code": code,
    "Origin": "https://shopmysticstudio.github.io", "User-Agent": "wishwell-try"})
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        out, left = json.load(r), r.headers.get("x-dry-left")
except urllib.error.HTTPError as e:
    sys.exit("Didn't work: HTTP %s %s" % (e.code, e.read().decode(errors="replace")[:300]))
profile = ", ".join(x for x in [a.who, a.age, a.lean, a.ints, "budget " + a.budget, a.notes] if x)
lines = ["Wishwell test run (nothing saved): " + profile, ""]
for i, o in enumerate(out["ideas"], 1):
    lines.append("%d. %s: $%d to $%d%s" % (i, o["title"], round(o["lo"]), round(o["hi"]), " (crowd hint)" if o["from"] == "crowd" else ""))
    if o.get("why"):
        lines.append("   " + o["why"])
h = out.get("hints") or {}
if h.get("liked"):
    lines += ["", "Crowd hints given to the AI: " + "; ".join(h["liked"])]
lines += ["", "Model: %s. Test runs left today: %s." % (out.get("model", "?"), left or "?")]
text = "\n".join(lines)
print(text)
if a.json:
    print(json.dumps(out, indent=2))
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a") as f:
        f.write("```\n" + text + "\n```\n")
