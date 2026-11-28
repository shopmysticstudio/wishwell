"""Play needs 64-bit native libraries to work on phones with 16 KB memory pages
(apps that target Android 15 and later). This checks every .so in the bundle: each loadable
segment must be aligned to at least 16 KB. Usage: python3 scripts/check-16kb.py app.aab"""
import struct, sys, zipfile

bad, seen = [], 0
with zipfile.ZipFile(sys.argv[1]) as z:
    for name in z.namelist():
        if not name.endswith(".so") or not ("arm64-v8a" in name or "x86_64" in name):
            continue
        seen += 1
        d = z.read(name)
        if d[:4] != b"\x7fELF" or d[4] != 2:
            bad.append(f"{name}: not a 64-bit ELF file")
            continue
        end = "<" if d[5] == 1 else ">"
        phoff, = struct.unpack_from(end + "Q", d, 0x20)
        phentsize, phnum = struct.unpack_from(end + "HH", d, 0x36)
        aligns = []
        for i in range(phnum):
            o = phoff + i * phentsize
            ptype, = struct.unpack_from(end + "I", d, o)
            if ptype == 1:  # PT_LOAD
                aligns.append(struct.unpack_from(end + "Q", d, o + 0x30)[0])
        low = min(aligns) if aligns else 0
        print(f"{name}: {len(d)//1024} KB, segment alignment {low}")
        if low < 16384:
            bad.append(f"{name}: aligned to {low}, needs 16384")
print(f"{seen} 64-bit native libraries checked")
if bad:
    print("Not ready for 16 KB pages:\n  " + "\n  ".join(bad))
    sys.exit(1)
