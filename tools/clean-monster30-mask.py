#!/usr/bin/env python3
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "game/public/assets/extracted/level1/Monster30.png"
OUT = ROOT / "game/public/assets/extracted/level1/Monster30_clean.png"


def main() -> None:
    image = Image.open(SRC).convert("RGBA")
    cleaned = []
    alpha2 = 0
    for r, g, b, a in image.getdata():
        if a <= 2:
            if a > 0:
                alpha2 += 1
            cleaned.append((0, 0, 0, 0))
        else:
            cleaned.append((r, g, b, a))
    image.putdata(cleaned)
    image.save(OUT)
    print(f"wrote {OUT.relative_to(ROOT)}; cleared {alpha2} alpha<=2 mask pixels")


if __name__ == "__main__":
    main()
