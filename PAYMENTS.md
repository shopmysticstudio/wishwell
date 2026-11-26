# Turning on Holiday Pass payments

Everything here is off until you fill in `app/config.js`. While `gumroadUrl` is
blank, the app looks and works exactly like the live site: the passes say
"Coming soon".

## 1. Make the product on Gumroad

1. Gumroad > Products > New product. Name: Holiday Pass. Price: $4.99.
   Type: Digital product.
2. In the product's settings, turn on **Generate a unique license key per sale**.
3. Publish the product.
4. Copy two things:
   - **Product link**, for example `https://YOURNAME.gumroad.com/l/holidaypass`
   - **Product ID**: on the product's edit page, open the License key section.
     The product ID is shown there (a short code of letters, numbers and symbols).

## 2. Set up the license check Worker

Follow `server/README.md` (about 5 minutes, free). At the end you have a Worker
address like `https://wishwell-license-check.YOUR-NAME.workers.dev`.

## 3. Paste into `app/config.js`

```js
window.WISHWELL_CONFIG = {
  aiUrl: "",
  shareBase: "https://shopmysticstudio.github.io/wishwell/app/",
  gumroadUrl: "PASTE THE PRODUCT LINK",
  gumroadProductId: "PASTE THE PRODUCT ID",
  licenseCheckUrl: "PASTE THE WORKER ADDRESS"
};
```

## 4. Before you publish

- Buy the pass yourself once (Gumroad lets you test with a 100% off discount
  code), paste the key in the app under Plans, and check it unlocks.
- Change the landing page line "Coming soon: AI gift ideas and the Holiday Pass"
  in `index.html` if the pass is no longer coming soon.
- The Holiday Pass card promises "Unlimited AI ideas" and "Price drop alerts".
  Price drop alerts are not built, and AI ideas only work once `aiUrl` is set.
  Change that list before taking money, so buyers get what the card says.
- Then merge the `payments` branch into `main`. The live site updates in a
  minute or two.

## What the pass does in the app

- Holiday Pass button opens Gumroad checkout in a new tab.
- Plans has an "I have a license key" box. A valid, paid, not refunded key
  turns the pass on, and it is saved on that device.
- With payments on and no pass: AI ideas stop after 3 rounds (starter ideas
  keep working), and groups of 5 or more need the pass to draw names.
- With the pass: unlimited AI rounds and any size group.
- The Exchange Pass still says "Coming soon".
