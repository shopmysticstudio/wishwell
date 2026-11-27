#!/usr/bin/env python3
"""Build the private beta copy of the app (beta/) from app/.

Usage, from the repo root on the payments branch:
    BETA_CODE="YOUR-CODE" python3 tools/build_beta.py OUTPUT_DIR
Add GUMROAD_URL="https://...gumroad.com/l/..." to turn on the Holiday Pass Buy button.

The access code itself is never written to the output. The page only gets a
salted PBKDF2 fingerprint of it, so the code screen can check a typed code.
The same code must be saved as the BETA_CODE secret on the wishwell-ai-ideas
Worker, which is what actually keeps the AI private.

The beta keeps its own saved lists and its own offline cache, so it never
mixes with the public app at /app.
"""
import hashlib, json, os, re, secrets, shutil, sys

AI_URL = "https://wishwell-ai-ideas.shopmysticstudio.workers.dev"
SHARE_BASE = "https://shopmysticstudio.github.io/wishwell/app/"
ITERATIONS = 200000


def norm(code):
    return re.sub(r"[^A-Z0-9]", "", code.upper())


def sub(text, old, new, count=1):
    """Replace old with new. count=None means every occurrence (at least one)."""
    n = text.count(old)
    assert (n >= 1) if count is None else (n == count), (old, n)
    return text.replace(old, new)


def main():
    code = os.environ.get("BETA_CODE", "")
    if len(norm(code)) < 8 or len(sys.argv) != 2:
        sys.exit("Set BETA_CODE (8 or more letters and numbers) and give an output folder.")
    out = sys.argv[1]
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(src, out)

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", norm(code).encode(), bytes.fromhex(salt), ITERATIONS).hex()

    # Settings: AI on, real payments off, shared lists open in the public app.
    cfg = os.path.join(out, "config.js")
    with open(cfg, encoding="utf-8") as f:
        c = f.read()
    c = re.sub(r'aiUrl: "[^"]*"', 'aiUrl: "%s"' % AI_URL, c)
    c = re.sub(r'shareBase: "[^"]*"', 'shareBase: "%s"' % SHARE_BASE, c)
    # GUMROAD_URL (optional) turns on the Holiday Pass Buy button in the beta.
    c = re.sub(r'gumroadUrl: "[^"]*"', 'gumroadUrl: "%s"' % os.environ.get("GUMROAD_URL", "").strip(), c)
    # Beta code holders get 15 free AI rounds (the Worker's BETA_ROUNDS enforces it).
    c = re.sub(r'freeRounds: \d+', 'freeRounds: 15', c)
    assert "freeRounds: 15" in c
    # The beta keeps its 15 rounds in total, not the public site's daily and weekly limits.
    c = re.sub(r"freeDaily: \d+", "freeDaily: 0", c)
    c = re.sub(r"freeWeekly: \d+", "freeWeekly: 0", c)
    assert "freeDaily: 0" in c and "freeWeekly: 0" in c
    # Beta only: shopping tools and the opening gift.
    c = re.sub(r"shopTools: (true|false)", "shopTools: true", c)
    c = re.sub(r"unwrap: (true|false)", "unwrap: true", c)
    assert "shopTools: true" in c and "unwrap: true" in c
    for k in ("gumroadProductId", "licenseCheckUrl"):
        c = re.sub(k + r': "[^"]*"', k + ': ""', c)
    with open(cfg, "w", encoding="utf-8") as f:
        f.write(c)

    # Offline cache: its own name, and only clean up its own old caches.
    sw = os.path.join(out, "sw.js")
    with open(sw, encoding="utf-8") as f:
        s = f.read()
    s = re.sub(r'const VERSION = "wishwell-v(\d+)";', r'const VERSION = "wishwell-beta-v\1";', s)
    s = sub(s, 'ks.filter(k => !k.startsWith("wishwell-beta-") && k !== VERSION)', 'ks.filter(k => k.startsWith("wishwell-beta-") && k !== VERSION)')
    with open(sw, "w", encoding="utf-8") as f:
        f.write(s)

    man = os.path.join(out, "manifest.webmanifest")
    with open(man, encoding="utf-8") as f:
        m = json.load(f)
    m["name"] = m["short_name"] = "Wishwell Beta"
    with open(man, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2)
        f.write("\n")

    page = os.path.join(out, "index.html")
    with open(page, encoding="utf-8") as f:
        h = f.read()
    h = sub(h, "<title>Wishwell</title>", '<title>Wishwell Beta</title>\n<meta name="robots" content="noindex, nofollow">')
    h = sub(h, '<meta name="apple-mobile-web-app-title" content="Wishwell">', '<meta name="apple-mobile-web-app-title" content="Wishwell Beta">')
    h = sub(h, "Test draft by Wishwell", "Beta by Wishwell")
    # Link to the beta's Advent calendar (beta/advent, kept in the main branch beside the build).
    h = sub(h, '<button class="plans" id="openPlans" type="button">Plans</button>',
            '<a class="plans" href="advent/" style="text-decoration:none;display:inline-flex;align-items:center;background:#ffc94a">\U0001F384 Advent</a>\n  <button class="plans" id="openPlans" type="button">Plans</button>')
    h = sub(h, '"wishbook-v1"', '"wishbook-beta-v1"', None)
    h = sub(h, '"wishwell-pass"', '"wishwell-beta-pass"', None)
    gate_head = GATE_HEAD.replace("@SALT@", salt).replace("@HASH@", digest).replace("@ITER@", str(ITERATIONS))
    h = sub(h, "</head>", gate_head + "</head>")
    h = sub(h, "<body>\n", "<body>\n" + GATE_BODY)
    with open(page, "w", encoding="utf-8") as f:
        f.write(h)
    print("Built", out, "with AI at", AI_URL)


GATE_HEAD = """<style>
html.locked body>*:not(#gate){display:none!important}
#gate{display:none}
html.locked #gate{display:grid;position:fixed;inset:0;z-index:100;place-items:center;padding:24px 16px;color:#fff;
 background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(255,201,74,.22),transparent 70%),linear-gradient(#23284d,#161a36)}
#gate .gbox{width:100%;max-width:380px;text-align:center}
#gate img{width:84px;height:84px;filter:drop-shadow(0 6px 18px rgba(255,201,74,.35))}
#gate h1{font-size:34px;margin:8px 0 4px}
#gate p{margin:0 0 18px;color:#e9e6f5}
#gate input{width:100%;font:inherit;font-size:20px;text-align:center;letter-spacing:.08em;text-transform:uppercase;padding:12px;border-radius:12px;border:2px solid #ffc94a;background:#fff;color:#141414;min-height:52px}
#gate button{width:100%;margin-top:12px;font:inherit;font-weight:900;font-size:18px;border:0;border-radius:999px;padding:14px;min-height:52px;background:#e0453a;color:#fff;cursor:pointer}
#gate button:disabled{opacity:.6}
#gate .gmsg{min-height:1.5em;margin-top:12px;color:#ffc94a;font-weight:700}
</style>
<script>
/* Beta code screen. Only a salted fingerprint of the code is here, not the code. */
document.documentElement.classList.add("locked");
window.WISHWELL_BETA={salt:"@SALT@",hash:"@HASH@",iter:@ITER@};
window.wishwellBetaCheck=async function(code){
  const c=String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(c.length<8||!(window.crypto&&crypto.subtle))return false;
  const B=window.WISHWELL_BETA,salt=new Uint8Array(B.salt.match(/../g).map(x=>parseInt(x,16)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(c),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:B.iter},key,256);
  const hex=[...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
  if(hex!==B.hash)return false;
  window.WISHWELL_ACCESS_CODE=c;return true;
};
(async()=>{let saved="";try{saved=localStorage.getItem("wishwell-beta-code")||""}catch(e){}
  if(saved&&await window.wishwellBetaCheck(saved))document.documentElement.classList.remove("locked");})();
</script>
"""

GATE_BODY = """<div id="gate" role="dialog" aria-modal="true" aria-labelledby="gateT"><form class="gbox" id="gateForm" autocomplete="off">
  <img src="img/mark.png" alt="Wishwell logo" width="84" height="84">
  <h1 id="gateT">Wishwell Beta</h1>
  <p>This early version is for invited testers. Enter your access code.</p>
  <input id="gateCode" type="text" inputmode="text" autocapitalize="characters" spellcheck="false" aria-label="Access code" placeholder="Access code">
  <button type="submit" id="gateBtn">Enter</button>
  <div class="gmsg" id="gateMsg" role="status"></div>
</form></div>
<script>
document.getElementById("gateForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=document.getElementById("gateBtn"),msg=document.getElementById("gateMsg"),v=document.getElementById("gateCode").value;
  btn.disabled=true;msg.textContent="Checking...";
  const ok=await window.wishwellBetaCheck(v).catch(()=>false);btn.disabled=false;
  if(!ok){msg.textContent="That code didn't work. Check it and try again.";return}
  try{localStorage.setItem("wishwell-beta-code",window.WISHWELL_ACCESS_CODE)}catch(err){}
  msg.textContent="";document.documentElement.classList.remove("locked");window.scrollTo(0,0);
});
</script>
"""

if __name__ == "__main__":
    main()
