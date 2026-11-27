/* Wishwell settings. Leave blank to run with starter ideas only.
   aiUrl:     address of your Wishwell AI service (see ../server/README.md), e.g. "https://wishwell-ai.example.workers.dev"
   shareBase: address people open for shared lists. Blank = wherever this app is hosted.
   gumroadUrl:       your Holiday Pass product link on Gumroad. Blank = passes show "Coming soon".
   gumroadProductId: the product ID from Gumroad (needed to check license keys).
   licenseCheckUrl:  where to check license keys. Blank = the AI service's /verify (or Gumroad directly if aiUrl is blank).
   See PAYMENTS.md for the full steps. */
window.WISHWELL_CONFIG = {
  aiUrl: "",
  shareBase: "https://shopmysticstudio.github.io/wishwell/app/",
  gumroadUrl: "",
  gumroadProductId: "",
  licenseCheckUrl: ""
};
