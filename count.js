/* Wishwell page counter. Counts one page view per visit, and clicks on a few buttons, as daily
   totals: the page, the site you came from (domain only), and phone or desktop. No cookies, no ids,
   nothing saved on your device. Follows the app's sharing pop-up (the same choice the round log uses):
   skipped after No thanks, and skipped if your browser asks sites not to track you unless you said Count me in. */
(function () {
  if (location.hostname !== "shopmysticstudio.github.io") return;
  var priv = !!(navigator.globalPrivacyControl || navigator.doNotTrack === "1" || window.doNotTrack === "1");
  var choice = "";
  try { choice = localStorage.getItem("wishwell-share-ok") || ""; } catch (e) {}
  var to = "https://wishwell-ai-ideas.shopmysticstudio.workers.dev/v";
  var page = location.pathname.replace(/^\/wishwell/, "").replace(/index\.html$/, "");
  if (!/\/$/.test(page)) page += "/";
  var ref = "";
  try { var h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h; } catch (e) {}
  var phone = false;
  try { phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600; } catch (e) {}
  var stopped = false;
  function send(ev) {
    if (stopped) return;
    try {
      var body = JSON.stringify({ p: page, e: ev || "view", r: ev ? "" : ref, d: phone ? "phone" : "desktop" });
      // A plain fetch first (some blockers drop beacons), a beacon only if fetch fails.
      fetch(to, { method: "POST", body: body, keepalive: true, mode: "no-cors", headers: { "content-type": "text/plain" } })
        .catch(function () { try { navigator.sendBeacon && navigator.sendBeacon(to, new Blob([body], { type: "text/plain" })); } catch (e) {} });
    } catch (e) {}
  }
  var on = false;
  function start() {
    if (on) return;
    on = true;
    window.wishwellCount = send;
    send();
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-count]");
      if (t) send(t.getAttribute("data-count"));
    }, true);
  }
  // The app calls this when you say yes in its Do Not Track pop-up, so this visit counts too.
  window.wishwellCountStart = function () { stopped = false; start(); };
  // ...and this when you say No thanks, so nothing more is counted.
  window.wishwellCountStop = function () { stopped = true; };
  if (choice !== "no" && (!priv || choice === "yes")) start();
})();
