/* Wishwell page counter. Counts one page view per visit, and clicks on a few buttons, as daily
   totals: the page, the site you came from (domain only), and phone or desktop. No cookies, no ids,
   nothing saved on your device. Skipped if your browser asks sites not to track you, unless you said
   yes to sharing in the app's pop-up (the same choice the round log uses). */
(function () {
  if (location.hostname !== "shopmysticstudio.github.io") return;
  var priv = !!(navigator.globalPrivacyControl || navigator.doNotTrack === "1" || window.doNotTrack === "1");
  var ok = false;
  try { ok = localStorage.getItem("wishwell-share-ok") === "yes"; } catch (e) {}
  var to = "https://wishwell-ai-ideas.shopmysticstudio.workers.dev/v";
  var page = location.pathname.replace(/^\/wishwell/, "").replace(/index\.html$/, "");
  if (!/\/$/.test(page)) page += "/";
  var ref = "";
  try { var h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h; } catch (e) {}
  var phone = false;
  try { phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600; } catch (e) {}
  function send(ev) {
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
  window.wishwellCountStart = start;
  if (!priv || ok) start();
})();
