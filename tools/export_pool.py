#!/usr/bin/env python3
"""Turn the AI idea pool into new starter ideas for the free app.

The AI Worker saves every round's ideas, and the AI ideas people kept, to its KV
namespace under keys starting with "pool:". This script counts how often each idea
was kept, picks the best ones that aren't already starter ideas, and prints them in
the starter list format (or adds them to the BANK list in app/index.html with --write).

Read the pool straight from Cloudflare (needs an API token with "Workers KV Storage: Read"):
    CF_API_TOKEN=... CF_ACCOUNT_ID=... python3 tools/export_pool.py --top 40
Or from a JSON file holding a list of pool records (for example saved with wrangler):
    python3 tools/export_pool.py --from-json pool.json --top 40
Add --write to put the ideas into app/index.html.

Only titles, categories, prices, reasons, search phrases and the quiz interests are in
the pool, never notes, names, IPs or device ids.
"""
import argparse, collections, json, os, re, statistics, sys, urllib.parse, urllib.request

NAMESPACE_ID = "9e7e866afc6e4d1ca50c4a86f30169e7"   # wishwell-ai-ideas-data
APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "index.html")
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
    ap.add_argument("--from-json", help="JSON file with a list of pool records")
    ap.add_argument("--top", type=int, default=40, help="how many ideas to export (default 40)")
    ap.add_argument("--min-kept", type=int, default=2, help="least times an idea must be kept (default 2)")
    ap.add_argument("--write", action="store_true", help="add the ideas to BANK in app/index.html")
    a = ap.parse_args()

    if a.from_json:
        records = json.load(open(a.from_json, encoding="utf-8"))
    else:
        token, account = os.environ.get("CF_API_TOKEN"), os.environ.get("CF_ACCOUNT_ID")
        if not token or not account:
            sys.exit("Set CF_API_TOKEN and CF_ACCOUNT_ID, or use --from-json.")
        records = load_cloudflare(token, account, os.environ.get("KV_NAMESPACE_ID", NAMESPACE_ID))

    html = open(APP, encoding="utf-8").read()
    (bank, bs, be), (ints_list, _, _) = app_lists(html)
    int_words = {n: w for n, w in ints_list}
    have = {norm(b[0]) for b in bank}
    cats = {"Tech", "Gaming", "Making", "Art", "Music", "Sports", "Outdoors", "Science", "Books", "Food",
            "Style", "Room", "Experiences", "Other"}

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

    rows = []
    for k, n in kept.most_common():
        if n < a.min_kept or k not in info or k in have:
            continue
        d = info[k]
        title = d["title"].most_common(1)[0][0]
        cat = d["cat"].most_common(1)[0][0]
        cat = cat if cat in cats else "Other"
        lo, hi = int(statistics.median(d["lo"])), int(statistics.median(d["hi"]))
        if hi < lo:
            hi = lo
        why = d["why"].most_common(1)[0][0] if d["why"] else ""
        search = d["search"].most_common(1)[0][0] if d["search"] else title
        rows.append({"row": [title, cat, lo, hi, tags_for(search, why, cat, d["ints"], int_words), why],
                     "kept": n, "shown": shown[k]})
        if len(rows) >= a.top:
            break

    print(f"{len(records)} pool records, {len(shown)} different AI ideas, {len(kept)} kept at least once.")
    print(f"Exporting {len(rows)} ideas kept {a.min_kept}+ times that aren't starter ideas yet:\n")
    for r in rows:
        print(f"  kept {r['kept']:>3} of {r['shown']:>3} shown  " + json.dumps(r["row"], ensure_ascii=False))
    if a.write and rows:
        lines = ",\n".join(json.dumps(r["row"], ensure_ascii=False, separators=(",", ":")) for r in rows)
        new = html[:be].rstrip() + ",\n" + lines + "\n" + html[be:]
        open(APP, "w", encoding="utf-8").write(new)
        print(f"\nAdded {len(rows)} ideas to BANK in app/index.html (now {len(bank) + len(rows)}).")
        print("Bump VERSION in app/sw.js before publishing so phones pick up the change.")


if __name__ == "__main__":
    main()
