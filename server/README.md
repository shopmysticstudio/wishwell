# Wishwell server pieces

## ai-ideas

A Cloudflare Worker that makes the app's AI gift ideas with Workers AI and decides
who may use AI. Cloudflare deploys it automatically from the `payments` branch
(Workers Builds, root directory `server/ai-ideas`).

- `POST /` gift ideas. Needs the beta code while `BETA_ONLY` is "true".
- `POST /verify` Holiday Pass license check for the app's "I have a license key" box.
- Free trial: 3 rounds per device (`x-device-id`), 6 trial rounds per IP per day.
  Then `402 {"error":"trial_used"}` and the app shows the Holiday Pass wall.
- Holiday Pass: a valid Gumroad key (`x-pass-key`) gets 25 rounds a day.
- Every other problem answers 429, and the app quietly shows starter ideas.
- Ideas over the budget or with brand names are dropped; the model is asked for a
  few extra to make up for it.
- Each round's ideas (no notes, names, IPs or device ids) go to the idea pool in
  KV for `tools/export_pool.py`.

Settings live in `wrangler.toml` `[vars]`. Secrets (dashboard > Settings >
Variables and Secrets > Type: Secret): `GUMROAD_PRODUCT_ID` (needed for passes),
`BETA_CODE` (optional, overrides the beta code fingerprint in `worker.js`).

Bindings: `AI` (Workers AI), `KV` (namespace `wishwell-ai-ideas-data`),
`PER_MINUTE` (5 requests a minute per IP).

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
