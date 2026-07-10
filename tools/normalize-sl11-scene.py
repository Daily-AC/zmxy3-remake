#!/usr/bin/env python3
"""Remove FFDec-only masks and low-alpha color garbage from the sl11 render."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


MARKER_BOX = (490, 175, 595, 271)
ALPHA_FLOOR = 32
BLACK_FLOOR = 8


def normalize(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    marker_left, marker_top, marker_right, marker_bottom = MARKER_BOX

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            editor_marker = marker_left <= x < marker_right and marker_top <= y < marker_bottom
            ffdec_black_mask = alpha > 0 and max(red, green, blue) <= BLACK_FLOOR
            ffdec_color_fringe = alpha < ALPHA_FLOOR
            if editor_marker or ffdec_black_mask or ffdec_color_fringe:
                pixels[x, y] = (0, 0, 0, 0)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    normalize(args.source, args.destination)


if __name__ == "__main__":
    main()
