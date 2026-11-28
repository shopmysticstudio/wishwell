/* Wishwell settings. Leave blank to run with starter ideas only.
   aiUrl:     address of your Wishwell AI service (see ../server/README.md), e.g. "https://wishwell-ai.example.workers.dev"
   shareBase: address people open for shared lists. Blank = wherever this app is hosted.
   gumroadUrl:       your Holiday Pass product link on Gumroad. Blank = passes show "Coming soon".
   gumroadProductId: the product ID from Gumroad (needed to check license keys).
   licenseCheckUrl:  where to check license keys. Blank = the AI service's /verify (or Gumroad directly if aiUrl is blank).
   freeRounds:       free AI rounds shown in the app (the AI service enforces the real number).
   freeDaily, freeWeekly: free AI rounds a day and a week (public site). 0 = use freeRounds instead.
   shopTools:        beta shopping tools (compare prices, add from a photo, Magic Coupons).
   coupons:          the Magic Coupons tab without the other shopping tools.
   unwrap:           the gift that unwraps when the app opens.
   keyEntry:         show the Holiday Pass key and email box even while the Buy button is still Coming soon.
   See PAYMENTS.md for the full steps. */
window.WISHWELL_CONFIG = {
  aiUrl: "https://wishwell-ai-ideas.shopmysticstudio.workers.dev",
  shareBase: "https://shopmysticstudio.github.io/wishwell/app/",
  gumroadUrl: "",
  gumroadProductId: "",
  licenseCheckUrl: "",
  freeRounds: 3,
  freeDaily: 6,
  freeWeekly: 0,
  shopTools: false,
  coupons: true,
  unwrap: true,
  keyEntry: true
};
