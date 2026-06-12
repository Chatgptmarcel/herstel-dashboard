# Genereert de app-iconen voor het Herstel Dashboard (PWA).
# Ontwerp: indigo-violet verloop met wit hart en hartslaglijn.
# Uitvoer: icons/ map met alle formaten die de manifest en iOS nodig hebben.
#
# Gebruik:  python tools/maak-iconen.py
import os
from PIL import Image, ImageDraw
import math

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UIT = os.path.join(REPO, "icons")
os.makedirs(UIT, exist_ok=True)

INDIGO = (99, 102, 241)    # #6366f1 (indigo-500)
VIOLET = (124, 58, 237)    # #7c3aed (violet-600)
LIJN = (79, 70, 229)       # #4f46e5 (indigo-600) — hartslaglijn op het witte hart
WIT = (255, 255, 255)

SS = 4  # supersampling-factor voor gladde randen


def verloop(grootte):
    """Diagonaal kleurverloop van indigo (linksboven) naar violet (rechtsonder)."""
    klein = Image.new("RGB", (64, 64))
    px = klein.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126.0
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(INDIGO, VIOLET))
    return klein.resize((grootte, grootte), Image.BILINEAR)


def hart_punten(cx, cy, schaal, stappen=240):
    """Parametrische hartcurve, geschaald en gecentreerd (scherm-y omlaag)."""
    punten = []
    for i in range(stappen):
        t = 2 * math.pi * i / stappen
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        punten.append((cx + x * schaal, cy - y * schaal))
    return punten


def teken_icoon(grootte, hart_factor):
    """Tekent het icoon op `grootte` px; hart_factor bepaalt hoe groot het hart is
    (kleiner voor de maskable-variant, zodat het binnen de veilige zone valt)."""
    g = grootte * SS
    img = verloop(g).convert("RGB")
    d = ImageDraw.Draw(img)

    cx, cy = g / 2, g / 2 * 0.98
    schaal = (g * hart_factor) / 34.0  # hartcurve is ~32 eenheden breed
    d.polygon(hart_punten(cx, cy, schaal), fill=WIT)

    # Hartslaglijn (ecg) binnen het hart, iets boven het midden
    W = 32 * schaal
    H = 29 * schaal
    ly = cy - H * 0.06
    dik = max(2, int(g * 0.030))
    pts = [
        (cx - W * 0.30, ly),
        (cx - W * 0.12, ly),
        (cx - W * 0.05, ly - H * 0.16),
        (cx + W * 0.04, ly + H * 0.13),
        (cx + W * 0.10, ly),
        (cx + W * 0.30, ly),
    ]
    d.line(pts, fill=LIJN, width=dik, joint="curve")
    r = dik / 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=LIJN)

    return img.resize((grootte, grootte), Image.LANCZOS)


# 'any' iconen (volledige bleed) + maskable (hart kleiner i.v.m. ronde maskers)
teken_icoon(192, 0.62).save(os.path.join(UIT, "icon-192.png"))
teken_icoon(512, 0.62).save(os.path.join(UIT, "icon-512.png"))
teken_icoon(512, 0.50).save(os.path.join(UIT, "icon-maskable-512.png"))
teken_icoon(180, 0.62).save(os.path.join(UIT, "apple-touch-icon.png"))
teken_icoon(32, 0.66).save(os.path.join(UIT, "favicon-32.png"))

print("Iconen geschreven naar", UIT)
for f in sorted(os.listdir(UIT)):
    print(" -", f, os.path.getsize(os.path.join(UIT, f)), "bytes")
