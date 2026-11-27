#!/usr/bin/env python3
"""Turn the AI idea pool into new starter ideas for the app (website and Play app).

The AI Worker saves every round's ideas with the taste tags that produced them, and counts
how often people circled each AI idea, ranked it in their top 3, or cut it. This script
scores the ideas, drops brand names, odd prices and near duplicates of existing starter
ideas, and prints the best ones in the starter list format. With --write it adds them to
the BANK list in app/index.html, which both the website and the Play app are built from.

From the D1 database (current pool). Easiest, with wrangler logged in:
    cd server/ai-ideas
    npx wrangler d1 execute wishwell-ideas --remote --json --command "SELECT i.*, (SELECT json_group_object(tag, n) FROM idea_tags t WHERE t.key = i.key) AS tags FROM ideas i" > ../../pool.json
    cd ../..
    python3 tools/export_pool.py --from-d1-json pool.json --top 40
Or straight from Cloudflare (API token with "D1: Read"):
    CF_API_TOKEN=... CF_ACCOUNT_ID=... python3 tools/export_pool.py --from-d1 --top 40
The old KV pool still works: --from-kv (token with "Workers KV Storage: Read") or
--from-json pool.json (a list of KV pool records).
Add --write to put the ideas into app/index.html.

Only titles, categories, prices, reasons, search phrases and taste tags are in the pool,
never notes, names, IPs, device ids or license keys.
"""
import argparse, collections, json, os, re, statistics, sys, urllib.parse, urllib.request

NAMESPACE_ID = "9e7e866afc6e4d1ca50c4a86f30169e7"   # wishwell-ai-ideas-data
D1_ID = "43981f5d-4653-4ec4-8261-0b493b3020a8"        # wishwell-ideas
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "index.html")
WORKER = os.path.join(HERE, "..", "server", "ai-ideas", "worker.js")
D1_SQL = ("SELECT i.*, (SELECT json_group_object(tag, n) FROM idea_tags t WHERE t.key = i.key) AS tags "
          "FROM ideas i")
MAX_PRICE = 1000   # starter ideas stay under this
STOP = set("a an and the for with of to in on at by from your their them they you it its this that is are be "
           "set kit gift gifts best great new mini small large".split())


def cf_get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def load_cloudflare(token, account, namespace):
    base = f"https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}"
    keys, cursor = [], ""
    while True:
        q = {"prefix": "pool:", "limit": "1000"}
        if cursor:
            q["cursor"] = cursor
        page = json.loads(cf_get(base + "/keys?" + urllib.parse.urlencode(q), token))
        keys += [k["name"] for k in page.get("result", [])]
        cursor = (page.get("result_info") or {}).get("cursor") or ""
        if not cursor:
            break
    records = []
    for i, k in enumerate(keys):
        try:
            records.append(json.loads(cf_get(base + "/values/" + urllib.parse.quote(k, safe=""), token)))
        except Exception as e:
            print(f"skipped {k}: {e}", file=sys.stderr)
        if (i + 1) % 100 == 0:
            print(f"read {i + 1} of {len(keys)} records", file=sys.stderr)
    return records


def load_d1(token, account, db):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query"
    req = urllib.request.Request(url, data=json.dumps({"sql": D1_SQL}).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + token, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return d1_rows(json.loads(r.read()))


def d1_rows(data):
    """Rows from a D1 API answer or `wrangler d1 execute --json` output."""
    if isinstance(data, dict):
        data = data.get("result", [data])
    rows = []
    for part in data if isinstance(data, list) else []:
        if isinstance(part, dict) and isinstance(part.get("results"), list):
            rows += part["results"]
        elif isinstance(part, dict) and "key" in part:
            rows.append(part)
    return rows


def brand_regex():
    """The Worker's brand list, so exported ideas follow the same no-brands rule."""
    src = open(WORKER, encoding="utf-8").read()
    body = src[src.index("const BRANDS = ["):]
    body = body[body.index("[") + 1:body.index("];")]
    names = re.findall(r'"([^"]+)"', body)
    return re.compile(r"\b(" + "|".join(re.escape(n).replace(r"\ ", r"\s+") for n in names) + r")('s)?\b", re.I)


def words(t):
    out = set()
    for w in re.findall(r"[a-z0-9]+", t.lower()):
        if w in STOP:
            continue
        out.add(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w)
    return out


def near_duplicate(title, others):
    """True when title shares nearly all its words with one of others (word sets)."""
    a = words(title)
    if not a:
        return True
    for b in others:
        if not b:
            continue
        overlap = len(a & b) / len(a | b)
        if overlap >= 0.75 or (len(a) >= 2 and (a <= b or b <= a) and min(len(a), len(b)) >= 2):
            return True
    return False


def score(kept, top, cut, shown, have=0):
    """Share of showings that ended in a circle, with a top 3 worth two, an "already have it"
    worth one (a real, wanted gift) and a cut costing one. The +1 and +5 keep an idea shown
    once and circled once from beating one circled 30 of 40 times."""
    return (kept + 2 * top + have - cut + 1) / (shown + 5)


def app_lists(html):
    def grab(name):
        i = html.index("const " + name + "=")
        s = html.index("[", i)
        d = 0
        for j in range(s, len(html)):
            if html[j] == "[":
                d += 1
            elif html[j] == "]":
                d -= 1
                if d == 0:
                    return json.loads(html[s:j + 1]), s, j
    return grab("BANK"), grab("INTS")


def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def tags_for(search, why, category, ints, int_words):
    words = []
    for w in re.findall(r"[a-z0-9]+", (search + " " + why).lower()):
        if len(w) > 2 and w not in STOP and w not in words:
            words.append(w)
    for name, n in ints.most_common(3):
        for w in int_words.get(name, "").split()[:2]:
            if w not in words:
                words.append(w)
    return " ".join(words[:8]) or category.lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-d1", action="store_true", help="read the D1 pool from Cloudflare (CF_API_TOKEN, CF_ACCOUNT_ID)")
    ap.add_argument("--from-d1-json", help="JSON from `wrangler d1 execute --json` (see above)")
    ap.add_argument("--from-kv", action="store_true", help="read the old KV pool from Cloudflare")
    ap.add_argument("--from-json", help="JSON file with a list of old KV pool records")
    ap.add_argument("--top", type=int, default=40, help="how many ideas to export (default 40)")
    ap.add_argument("--min-kept", type=int, default=2, help="least times an idea must be kept (default 2)")
    ap.add_argument("--max-price", type=int, default=MAX_PRICE, help=f"highest typical price allowed (default {MAX_PRICE})")
    ap.add_argument("--write", action="store_true", help="add the ideas to BANK in app/index.html")
    a = ap.parse_args()

    token, account = os.environ.get("CF_API_TOKEN"), os.environ.get("CF_ACCOUNT_ID")
    need_cf = a.from_d1 or a.from_kv
    if need_cf and (not token or not account):
        sys.exit("Set CF_API_TOKEN and CF_ACCOUNT_ID.")
    if not (a.from_d1 or a.from_d1_json or a.from_kv or a.from_json):
        sys.exit("Pick a source: --from-d1-json FILE, --from-d1, --from-kv or --from-json FILE.")

    html = open(APP, encoding="utf-8").read()
    (bank, bs, be), (ints_list, _, _) = app_lists(html)
    int_words = {n: w for n, w in ints_list}
    have = {norm(b[0]) for b in bank}
    have_words = [words(b[0]) for b in bank]
    cats = {"Tech", "Gaming", "Making", "Art", "Music", "Sports", "Outdoors", "Science", "Books", "Food",
            "Style", "Room", "Experiences", "Other"}
    brand = brand_regex()

    # One entry per idea: title, category, prices, why, search, interests and counts.
    pool = {}
    if a.from_d1 or a.from_d1_json:
        rows = load_d1(token, account, os.environ.get("D1_DATABASE_ID", D1_ID)) if a.from_d1 else \
            d1_rows(json.load(open(a.from_d1_json, encoding="utf-8")))
        for r in rows:
            shown = int(r.get("shown") or 0)
            k = norm(r.get("title", ""))
            if not k or shown < 1:
                continue
            tags = r.get("tags") or {}
            if isinstance(tags, str):
                tags = json.loads(tags or "{}")
            ints = collections.Counter({t[4:]: n for t, n in tags.items() if t.startswith("int:")})
            pool[k] = {"title": r["title"], "cat": r.get("category", "Other"),
                       "lo": round(int(r.get("lo_sum") or 0) / shown), "hi": round(int(r.get("hi_sum") or 0) / shown),
                       "why": r.get("why", ""), "search": r.get("search") or r["title"], "ints": ints,
                       "shown": shown, "kept": int(r.get("kept") or 0), "top": int(r.get("top") or 0),
                       "cut": int(r.get("cut") or 0), "have": int(r.get("have") or 0)}
        source = f"{len(rows)} ideas in the D1 pool"
    else:
        records = json.load(open(a.from_json, encoding="utf-8")) if a.from_json else \
            load_cloudflare(token, account, os.environ.get("KV_NAMESPACE_ID", NAMESPACE_ID))
        shown, kept = collections.Counter(), collections.Counter()
        info = collections.defaultdict(lambda: {"title": collections.Counter(), "cat": collections.Counter(),
                                                "lo": [], "hi": [], "why": collections.Counter(),
                                                "search": collections.Counter(), "ints": collections.Counter()})
        for r in records:
            if not isinstance(r, dict):
                continue
            for i in r.get("ideas", []):
                k = norm(i.get("title", ""))
                if not k:
                    continue
                shown[k] += 1
                d = info[k]
                d["title"][i["title"]] += 1
                d["cat"][i.get("category", "Other")] += 1
                d["lo"].append(int(i.get("lo", 0)))
                d["hi"].append(int(i.get("hi", 0)))
                if i.get("why"):
                    d["why"][i["why"]] += 1
                if i.get("search"):
                    d["search"][i["search"]] += 1
                for n in r.get("ints", []):
                    d["ints"][n] += 1
            for t in set(norm(t) for t in r.get("kept", [])):
                kept[t] += 1
        for k, d in info.items():
            title = d["title"].most_common(1)[0][0]
            pool[k] = {"title": title, "cat": d["cat"].most_common(1)[0][0],
                       "lo": int(statistics.median(d["lo"])), "hi": int(statistics.median(d["hi"])),
                       "why": d["why"].most_common(1)[0][0] if d["why"] else "",
                       "search": d["search"].most_common(1)[0][0] if d["search"] else title,
                       "ints": d["ints"], "shown": shown[k], "kept": kept[k], "top": 0, "cut": 0}
        source = f"{len(records)} KV pool records, {len(pool)} different AI ideas"

    # Filters: kept enough, not a starter idea already (or nearly), no brands, sane prices.
    skipped = collections.Counter()
    picked, picked_words, rows = set(), [], []
    ranked = sorted(pool.items(), key=lambda kv: (score(kv[1]["kept"], kv[1]["top"], kv[1]["cut"], kv[1]["shown"], kv[1].get("have", 0)),
                                                  kv[1]["kept"]), reverse=True)
    for k, d in ranked:
        title = d["title"].strip()
        lo, hi = max(0, int(d["lo"])), max(0, int(d["hi"]))
        if hi < lo:
            hi = lo
        if d["kept"] < a.min_kept:
            skipped["kept too few times"] += 1
        elif k in have or near_duplicate(title, have_words):
            skipped["already a starter idea"] += 1
        elif near_duplicate(title, picked_words):
            skipped["duplicate of a better idea"] += 1
        elif brand.search(title) or brand.search(d["why"]):
            skipped["brand name"] += 1
        elif lo < 1 or hi > a.max_price:
            skipped["price out of range"] += 1
        elif len(title) > 50 or len(title) < 3:
            skipped["title length"] += 1
        else:
            cat = d["cat"] if d["cat"] in cats else "Other"
            search = brand.sub("", d["search"]).strip() or title
            rows.append({"row": [title, cat, lo, hi, tags_for(search, d["why"], cat, d["ints"], int_words), d["why"]],
                         "kept": d["kept"], "top": d["top"], "cut": d["cut"], "shown": d["shown"]})
            picked.add(k)
            picked_words.append(words(title))
            if len(rows) >= a.top:
                break

    print(f"{source}.")
    if skipped:
        print("Skipped: " + ", ".join(f"{n} {why}" for why, n in skipped.most_common()))
    print(f"Exporting {len(rows)} ideas kept {a.min_kept}+ times that aren't starter ideas yet:\n")
    for r in rows:
        print(f"  kept {r['kept']:>3}, top 3 {r['top']:>3}, cut {r['cut']:>3} of {r['shown']:>3} shown  "
              + json.dumps(r["row"], ensure_ascii=False))
    if a.write and rows:
        lines = ",\n".join(json.dumps(r["row"], ensure_ascii=False, separators=(",", ":")) for r in rows)
        new = html[:be].rstrip() + ",\n" + lines + "\n" + html[be:]
        open(APP, "w", encoding="utf-8").write(new)
        print(f"\nAdded {len(rows)} ideas to BANK in app/index.html (now {len(bank) + len(rows)}).")
        print("Bump VERSION in app/sw.js before publishing so phones pick up the change.")


if __name__ == "__main__":
    main()
