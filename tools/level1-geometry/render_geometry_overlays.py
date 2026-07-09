#!/usr/bin/env python3
"""Render extracted geometry rectangles on top of level 1 background PNGs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND_IMAGES = {
    "sl11": Path("game/public/assets/extracted/level1/bg11.png"),
    "sl12": Path("game/public/assets/extracted/level1/bg12.png"),
    "sl13": Path("game/public/assets/extracted/level1/bg13.png"),
}

OUTPUT_IMAGES = {
    "sl11": Path("tmp/geometry-overlay-sl11.png"),
    "sl12": Path("tmp/geometry-overlay-sl12.png"),
    "sl13": Path("tmp/geometry-overlay-sl13.png"),
}

# Drawing-only offsets. Extracted JSON stays in original scene coordinates.
DRAW_OFFSETS = {
    # Places the full sl11 climb, whose source y runs negative upward, onto bg11's
    # 3051px-tall extracted image. This is derived from the SWF background shape
    # bottom at scene y ~= 591 and bg11 image height 3051.
    "sl11": (0.0, 2459.95),
    "sl12": (0.0, 0.0),
    "sl13": (0.0, 0.0),
}

COLORS = {
    "solid": (255, 45, 35, 210),
    "through": (40, 220, 95, 210),
    "throughUpButDown": (255, 176, 0, 220),
    "throughDownButUp": (35, 140, 255, 220),
    "transferDoor": (230, 40, 255, 220),
    "marker": (0, 230, 230, 210),
}


def draw_rect(draw: ImageDraw.ImageDraw, rect: dict, color: tuple[int, int, int, int], offset: tuple[float, float]) -> None:
    ox, oy = offset
    x0 = float(rect["x"]) + ox
    y0 = float(rect["y"]) + oy
    x1 = x0 + float(rect["width"])
    y1 = y0 + float(rect["height"])
    draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
    fill = (color[0], color[1], color[2], 45)
    draw.rectangle([x0, y0, x1, y1], fill=fill)


def render_overlay(stage: dict, background_path: Path, output_path: Path) -> None:
    stage_id = stage["id"]
    image = Image.open(background_path).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    offset = DRAW_OFFSETS[stage_id]

    for wall in stage["walls"]:
        draw_rect(draw, wall, COLORS[wall["type"]], offset)
    for door in stage["transferDoors"]:
        draw_rect(draw, door, COLORS["transferDoor"], offset)
    for marker in stage["markers"]:
        draw_rect(draw, marker, COLORS["marker"], offset)

    combined = Image.alpha_composite(image, overlay)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.save(output_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geometry", type=Path, default=Path("game/src/data/levels/level1-geometry.json"))
    args = parser.parse_args()
    data = json.loads(args.geometry.read_text(encoding="utf-8"))
    for stage in data["subStages"]:
        stage_id = stage["id"]
        render_overlay(stage, BACKGROUND_IMAGES[stage_id], OUTPUT_IMAGES[stage_id])
        print(f"wrote {OUTPUT_IMAGES[stage_id]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
