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
