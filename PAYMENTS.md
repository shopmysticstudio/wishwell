# Paid AI on the website: setup and launch

The plan: the website's AI gift ideas are paid. Everyone gets **3 free AI rounds**
to try (counted by the server per device, plus a daily cap per IP address), then a
wall offers the **$4.99 Holiday Pass**: **25 AI rounds a day** and gift exchanges of
any size. The free starter ideas always work, with or without AI.

Everything below is tested on the private beta at `/wishwell/beta/` first. The
public app at `/wishwell/app/` and the landing page stay as they are until the
final test passes.

## What is already set up

- The AI Worker `wishwell-ai-ideas` (code in `server/ai-ideas/`) is deployed by
  Cloudflare from the `payments` branch. It now also checks Holiday Pass keys at
  `/verify`, so no second Worker is needed.
- A KV namespace `wishwell-ai-ideas-data` holds trial counts, pass usage, cached
  pass checks and the idea pool. It is bound to the Worker in `wrangler.toml`.
- While `BETA_ONLY = "true"` (in `wrangler.toml`), the AI only answers the beta.

## 1. Make the product on Gumroad

1. Gumroad > Products > New product. Name: Holiday Pass. Price: $4.99.
   Type: Digital product.
2. In the product's settings, turn on **Generate a unique license key per sale**.
3. Publish the product.
4. Copy two things:
   - **Product link**, for example `https://YOURNAME.gumroad.com/l/holidaypass`
   - **Product ID**: on the product's edit page, in the License key section.
5. Make a **100% off discount code** for testing (Gumroad > Products >
   Discounts). Delete it after the test.

## 2. Give the Worker the product ID

Cloudflare dashboard > Workers & Pages > wishwell-ai-ideas > Settings >
Variables and Secrets > Add > Type: **Secret**, Name: `GUMROAD_PRODUCT_ID`,
Value: the product ID > Deploy.

## 3. Turn on the Buy button in the beta

Ask Claude (or edit `tools/build_beta.py`) to rebuild `/beta` with the product
link as `gumroadUrl`. Only the beta changes.

## 4. Test on the beta

On a phone, at `https://shopmysticstudio.github.io/wishwell/beta/`:
1. Use 3 AI rounds. The 4th shows the Holiday Pass wall.
2. Tap **Get the Holiday Pass $4.99**, check out with the 100% off code.
3. Paste the license key from the receipt into Plans > "I have a license key".
4. AI ideas come back, and the AI line shows rounds left today.
5. Draw names for 5 or more people in Group.

## 5. Go live (only after step 4 passes)

1. In `server/ai-ideas/wrangler.toml` set `BETA_ONLY = "false"` (so the public
   site doesn't need the beta code).
2. In `app/config.js` set `aiUrl` to
   `https://wishwell-ai-ideas.shopmysticstudio.workers.dev` and `gumroadUrl` to the
   product link. Leave `licenseCheckUrl` blank (the AI Worker checks keys).
3. Update the landing page's "Coming soon" line.
4. Bump `VERSION` in `app/sw.js`, then merge `payments` into `main`.

## Making the free starter ideas better over time

Each AI round's ideas (title, category, prices, reason, search phrase) and the AI
ideas people keep are saved in KV, never notes, names, IPs or device ids. To move
the most-kept ones into the starter list that the free Play Store app also uses:

```
CF_API_TOKEN=... CF_ACCOUNT_ID=... python3 tools/export_pool.py --top 40 --write
```

The token needs "Workers KV Storage: Read" (Cloudflare dashboard > My Profile >
API Tokens). Check the printed list, bump `VERSION` in `app/sw.js`, and publish.

## Limits worth knowing

- One AI round costs about 20 of the free 10,000 daily Neurons, so the free plan
  covers about 490 rounds a day across everyone.
- KV's free plan allows 1,000 writes a day; each AI round uses 2 or 3. That caps
  the site at roughly 330 to 500 AI rounds a day on the free plan.
- Counts can lag by up to about 30 seconds between Cloudflare locations, so
  someone clicking very fast could get a 4th free round now and then.
- Clearing browser data gives a new device id, but the IP cap (6 trial rounds a
  day) still applies.
