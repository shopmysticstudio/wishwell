"""Makes the Android launcher icons, splash screens and the 512 px Play Store icon
from the web app's icons in ../app/icons. Run from android-app: python3 tools/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent.parent
icons = here.parent / "app" / "icons"
res = here / "android" / "app" / "src" / "main" / "res"
navy = (0x23, 0x28, 0x4D, 255)
full = Image.open(icons / "icon-512.png").convert("RGBA")
mask = Image.open(icons / "icon-maskable-512.png").convert("RGBA")

def flat(im):
    bg = Image.new("RGBA", im.size, navy)
    bg.alpha_composite(im)
    return bg

for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    sq = flat(full).resize((px, px), Image.LANCZOS)
    sq.convert("RGB").save(res / f"mipmap-{d}" / "ic_launcher.png")
    m = Image.new("L", (px * 4, px * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    rnd.paste(sq, (0, 0), m.resize((px, px), Image.LANCZOS))
    rnd.save(res / f"mipmap-{d}" / "ic_launcher_round.png")
    fg = px * 108 // 48
    flat(mask).resize((fg, fg), Image.LANCZOS).save(res / f"mipmap-{d}" / "ic_launcher_foreground.png")

(res / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#23284D</color>\n</resources>\n')

for p in res.glob("drawable*/splash.png"):
    w, h = Image.open(p).size
    sp = Image.new("RGBA", (w, h), navy)
    s = int(min(w, h) * 0.45)
    logo = mask.resize((s, s), Image.LANCZOS)
    sp.alpha_composite(logo, ((w - s) // 2, (h - s) // 2))
    sp.convert("RGB").save(p)

flat(full).convert("RGB").save(here / "store" / "play-icon-512.png")
print("icons done")
