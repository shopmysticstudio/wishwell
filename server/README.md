# Wishwell server pieces

## ai-ideas

A Cloudflare Worker that makes the app's AI gift ideas with Workers AI and decides
who may use AI. Cloudflare deploys it automatically from the `payments` branch
(Workers Builds, root directory `server/ai-ideas`).

- `POST /` gift ideas. Open to everyone while `BETA_ONLY` is "false" (needs the beta code when "true").
- `POST /verify` Holiday Pass license check for the app's "I have a license key" box.
- Free trial: 3 rounds per person, 15 with the beta code. Counted in D1 (table `ai_use`,
  made on first use) per device (`x-device-id`) and per network (hashed IP, IPv6 by /64,
  30 days), so clearing storage, a private window or another browser doesn't reset it.
  Rounds are reserved before the AI call and handed back if it fails.
  Then `402 {"error":"trial_used"}` and the app shows the Holiday Pass wall.
  Test: `node server/ai-ideas/test/limits.test.mjs`.
- Holiday Pass: a valid Gumroad key (`x-pass-key`) gets 25 rounds a day.
- Every other problem answers 429, and the app quietly shows starter ideas.
- Ideas over the budget or with brand names are dropped; the model is asked for a
  few extra to make up for it.
- `POST /photo` `{image}` (beta only, needs `x-beta-code`): a JPEG, PNG or WebP
  data URL up to about 700 KB. Llama 4 Scout reads the items in it and answers
  `{items:[{title, category, lo, hi, search}]}` (at most 8). Uses one AI round,
  handed back if nothing is found. The photo is never stored.
  Test: `node server/ai-ideas/test/photo.test.mjs`.
- `POST /signal` `{kept, top, cut}`: which AI ideas people circled, ranked in
  their top 3, or cut. Only titles already in the pool are counted. No device id.
- Idea pool: each round's ideas go to the D1 database `wishwell-ideas` (binding
  `DB`): title, category, why, search words, price range, and the taste tags that
  produced them (interest, budget, style, me/them). Never notes, names, IPs or
  device ids, and ideas that mention a name from the notes are skipped. Without
  `DB` the Worker falls back to the old KV `pool:` keys.

Settings live in `wrangler.toml` `[vars]`. Secrets (dashboard > Settings >
Variables and Secrets > Type: Secret): `GUMROAD_PRODUCT_ID` (needed for passes),
`BETA_CODE` (optional, overrides the beta code fingerprint in `worker.js`).

Bindings: `AI` (Workers AI), `KV` (namespace `wishwell-ai-ideas-data`),
`DB` (D1 `wishwell-ideas`, tables in `migrations/`), `PER_MINUTE` (5 requests
a minute per IP).

Test the pool locally: `node server/ai-ideas/test/pool.test.mjs` (Node 22+).

### Growing the starter ideas from the pool

From the repo root:

```
cd server/ai-ideas
npx wrangler d1 execute wishwell-ideas --remote --json --command "SELECT i.*, (SELECT json_group_object(tag, n) FROM idea_tags t WHERE t.key = i.key) AS tags FROM ideas i" > ../../pool.json
cd ../..
python3 tools/export_pool.py --from-d1-json pool.json --top 40
```

That prints the best ideas (kept by at least 2 people, no brands, under $1000,
no near-duplicates of each other or of the starter list). Add `--write` to
append them to `BANK` in `app/index.html`, then review the diff before
committing. Delete `pool.json` afterwards.

Manual deploy, if ever needed: `npx wrangler login`, then `npx wrangler deploy`
in `server/ai-ideas`.

### Beta access code

The private beta at `/wishwell/beta/` sends its access code with every AI
request, and the Worker always requires it. Requests without the right code
get a 429, so the app shows starter ideas instead. The Worker checks the code
against a salted fingerprint (`BETA_HASH` in `worker.js`); the code itself is
not in this repo. If a `BETA_CODE` secret is set on the Worker (Cloudflare
dashboard > Workers & Pages > wishwell-ai-ideas > Settings > Variables and
Secrets), the secret is used instead of the fingerprint. Codes match in any
letter case, with or without dashes.

To change the code: update the `BETA_CODE` secret (or `BETA_HASH`), then
rebuild the beta page with the new code (below).

To rebuild the beta from this branch (for example after app changes):
`BETA_CODE="THE-CODE" python3 tools/build_beta.py /tmp/beta`, then copy that
folder to `beta/` on `main`. The code is never written into the page.
