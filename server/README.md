# Wishwell server pieces

## license-check

A tiny Cloudflare Worker that checks Holiday Pass license keys with Gumroad.
The app uses it when `licenseCheckUrl` is set in `app/config.js`.

Why it exists: the app runs in the browser, and browsers only let a page read
another site's answer if that site allows it (CORS). Reports differ on whether
Gumroad's license API allows this, so the Worker asks Gumroad for the app and
always answers with the right permission. It also keeps buyer details out of
the browser: it only ever replies `{"valid": true}` or `{"valid": false}`.

Set up (free Cloudflare account):

1. Cloudflare dashboard > Workers & Pages > Create > Create Worker.
   Name it `wishwell-license-check` and click Deploy.
2. Click Edit code, delete what is there, paste in everything from
   `license-check/worker.js`, and click Deploy.
3. Worker > Settings > Variables and Secrets > Add:
   - `GUMROAD_PRODUCT_ID` = your Holiday Pass product ID
   - `ALLOWED_ORIGINS` = `https://shopmysticstudio.github.io`
   Click Deploy.
4. Copy the Worker address (it looks like
   `https://wishwell-license-check.YOUR-NAME.workers.dev`) and paste it into
   `licenseCheckUrl` in `app/config.js`.

If you use the command line instead: `npx wrangler deploy` from the
`license-check` folder, after filling in `wrangler.toml`.

## ai-ideas

A Cloudflare Worker that makes the app's AI gift ideas with Workers AI
(free plan: 10,000 Neurons a day for the whole account). The app uses it
when `aiUrl` is set in `app/config.js`. While `aiUrl` is blank, the app
uses its built-in starter ideas only.

What it does:
- Takes the quiz answers the app sends, checks and trims every field,
  and caps a round at 10 ideas.
- Keeps the AI instructions inside the Worker, not in the app.
- Cleans the model's reply down to a JSON list of
  `{title, category, lo, hi, why, search}`, dropping anything malformed,
  over budget or already seen.
- Answers 429 whenever anything goes wrong (model error, free daily amount
  used up, unusable reply, too many requests). The app then quietly shows
  starter ideas instead.
- Only answers https://shopmysticstudio.github.io.
- Limits each visitor (by IP address) to 5 rounds a minute. An optional
  daily cap per visitor (`DAILY_PER_IP`, default 30) turns on once you add
  the KV namespace described in `wrangler.toml`.

Set up (from a computer with Node.js installed):

1. Open a terminal in `server/ai-ideas`.
2. `npx wrangler login` and approve in the browser that opens
   (a free Cloudflare account is enough).
3. `npx wrangler deploy`
4. Copy the address it prints, which looks like
   `https://wishwell-ai-ideas.YOUR-NAME.workers.dev`, and paste it into
   `aiUrl` in `app/config.js`.
5. Optional daily cap: `npx wrangler kv namespace create LIMITS`, paste the
   id into `wrangler.toml` as its comments show, and run `npx wrangler deploy`
   again.

To try a different model, change `MODEL` in `wrangler.toml` and deploy again.
Pick one Cloudflare lists as available on the free plan.
