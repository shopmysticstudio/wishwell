/* Wishwell license check: a tiny Cloudflare Worker.
   The app sends {"license_key": "..."} here. This Worker asks Gumroad if the key
   is a real, paid, not refunded Holiday Pass and answers {"valid": true|false}.
   It never sends back the buyer's email or other purchase details.
   Settings (in wrangler.toml or the Cloudflare dashboard):
     GUMROAD_PRODUCT_ID  the Holiday Pass product ID from Gumroad
     ALLOWED_ORIGINS     sites allowed to call this, comma separated */
const GUMROAD = "https://api.gumroad.com/v2/licenses/verify";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const reply = (body, status) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "content-type": "application/json" }
    });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ valid: false, reason: "use_post" }, 405);
    if (!env.GUMROAD_PRODUCT_ID) return reply({ valid: false, reason: "not_set_up" }, 500);

    let key = "";
    try { key = String((await request.json()).license_key || "").trim(); } catch (e) {}
    if (!key || key.length > 100) return reply({ valid: false, reason: "missing_key" }, 400);

    let data;
    try {
      const res = await fetch(GUMROAD, {
        method: "POST",
        body: new URLSearchParams({ product_id: env.GUMROAD_PRODUCT_ID, license_key: key })
      });
      data = await res.json();
    } catch (e) {
      return reply({ valid: false, reason: "gumroad_unreachable" }, 502);
    }

    const p = (data && data.purchase) || {};
    const valid = !!(data && data.success && !p.refunded && !p.chargebacked && !p.disputed);
    return reply({ valid, reason: valid ? "" : (data && data.success ? "refunded" : "not_found") }, 200);
  }
};
