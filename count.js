/* Wishwell page counter. Counts one page view per visit, and clicks on a few buttons, as daily
   totals: the page, the site you came from (domain only), and phone or desktop. No cookies, no ids,
   nothing saved on your device. Skipped if your browser asks sites not to track you. */
(function () {
  if (location.hostname !== "shopmysticstudio.github.io") return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  var to = "https://wishwell-ai-ideas.shopmysticstudio.workers.dev/hit";
  var page = location.pathname.replace(/^\/wishwell/, "").replace(/index\.html$/, "");
  if (!/\/$/.test(page)) page += "/";
  var ref = "";
  try { var h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h; } catch (e) {}
  var phone = false;
  try { phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600; } catch (e) {}
  function send(ev) {
    try {
      var body = JSON.stringify({ p: page, e: ev || "view", r: ev ? "" : ref, d: phone ? "phone" : "desktop" });
      if (!(navigator.sendBeacon && navigator.sendBeacon(to, new Blob([body], { type: "text/plain" }))))
        fetch(to, { method: "POST", body: body, keepalive: true, mode: "no-cors" }).catch(function () {});
    } catch (e) {}
  }
  window.wishwellCount = send;
  send();
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-count]");
    if (t) send(t.getAttribute("data-count"));
  }, true);
})();
