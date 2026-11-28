# Holiday Pass keys for the Android app: plan

Plan only. Nothing here is built yet, and no payment is live.

## The path a buyer takes

1. On the website, tap **Buy the Holiday Pass key, $4.99** (Gumroad checkout).
2. Gumroad emails the receipt with a license key.
3. Install Wishwell from Google Play (US only).
4. Paste the key into the app's key box, and type the email used to buy it. AI
   gift ideas unlock.

The app shows only a key box and an email box. It never links to the website, never names Gumroad
or a price, and never says where to buy (Google Play's rule on steering buyers).

## How keys are issued

- **Phase 1 (no new code to issue keys):** turn on "Generate a unique license key
  per sale" on the Gumroad product. Gumroad makes and emails the key. The Worker
  already checks these keys at `/verify`.
- **Phase 2 (optional, nicer on a phone):** Gumroad keys are 35 characters. If
  typing them is a problem, the Worker could mint a short key (like
  `WW-7KQ4-M2XP`) for each sale from Gumroad's sale notification (Ping), tied to
  the Gumroad sale. Only worth it if testers struggle with paste.

## How the Worker checks a key (built Nov 27)

- Same Worker, `wishwell-ai-ideas`. The app sends:
  - `POST /verify` with `{"license_key": "...", "email": "..."}` and the
    `x-device-id` header once, when the key is entered. Answers `{"valid": true}`,
    or `{"valid": false, "reason": "not_found" | "refunded" | "device_limit"}`, or
    429 `{"error": "too_many_tries"}`;
  - every AI round: headers `x-pass-key` (the key), `x-pass-email` (the email) and
    `x-device-id` (a random id the app makes once and keeps).
- The email must match the Gumroad purchase email (trimmed, any case). A wrong
  email gets the same answer as an unknown key, so it gives nothing away.
- The Worker asks Gumroad's license API, then caches the answer in KV
  (6 hours when valid, 10 minutes when not). A refunded, charged-back or disputed
  sale stops working within 6 hours.
- If Gumroad is down, a key that checked out in the last 24 hours keeps working.

## One key per buyer, with a device limit

- One sale, one key. Gumroad counts uses on `/verify`.
- The Worker keeps a list (in KV, `passdev:`) of hashed device ids per key. **Limit: 3
  devices.** A 4th device gets `key_device_limit`, and the app says "This key is
  already on 3 devices."
- Leo can clear a key's devices by hand (a D1 row) when someone gets a new phone.

## Limits for key holders

- Free (no key, website only): 6 AI rounds a day, no weekly cap.
- Key holders: **25 a day** (today's `PASS_DAILY`), plus a weekly cap of
  **100** so one key can't eat the whole AI budget. Counted per key, across all
  its devices, app and website together. Same day start (midnight US Eastern).
- The app reads `x-pass-left` to show rounds left today.

## App side (Android thread, later)

- Unlock screen: a key box and an email box, an Unlock button, and nothing else:
  no link, no store or website name, no price.
- Keep the key and email on the phone; send them as `x-pass-key` and
  `x-pass-email` with `x-device-id` on each AI round.
- Messages for `device_limit` / `pass_device_limit` ("already on 3 devices"),
  `too_many_tries`, `pass_daily_limit`, `pass_weekly_limit` and `pass_invalid`.

## What the app needs from the Worker (small changes, later)

- **Origin (done):** the app's WebView sends `Origin: https://localhost` (APP_ORIGINS
  in wrangler.toml). From that origin the Worker answers only `/verify`, `/signal` and idea
  rounds that carry `x-pass-key`; no free trial, `/photo` or `/waitlist`.
- **Play Integrity (later):** the app can send a Play Integrity token so the
  Worker knows the call comes from the real Wishwell app on a real phone.
- `/photo` (photo to list) is beta-only today; key holders could get it too.

## Abuse risks and answers

- **Sharing a key:** 3-device cap and the per-key daily and weekly caps.
- **Sharing keys:** a key needs the buyer's email too, so passing on the key
  alone doesn't work.
- **Guessing keys:** keys are long and random; besides the 5-a-minute limit per
  network, 10 wrong key or email tries per network per day (PASS_BAD_TRIES), then
  429 `too_many_tries` until the next day.
- **Refund, then keep using:** the 6-hour cache ends access after a refund.
- **Scripts calling the Worker:** a key is needed outside the website; Play
  Integrity later.
- **Reselling keys:** device cap makes a resold key weak; Leo can revoke one.
- **AI cost:** the free Workers AI plan covers about 60 AI rounds a day for
  everyone combined. A few busy key holders could use that up, so the AI budget
  has to be settled before keys go on sale.

## Still Leo's to do before any sale

- The Gumroad product "Wishwell Holiday Pass" ($4.99) exists as an unpublished
  draft. Turn on "Generate a unique license key per sale" in its settings, and
  keep it unpublished until the test passes.
- Put its product ID in the Worker as the Secret `GUMROAD_PRODUCT_ID` (Cloudflare
  dashboard), so the Worker can check keys.
- Decide on the AI budget (see AI cost above).
- Run the 100% off test purchase on /beta.
