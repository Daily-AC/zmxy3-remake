#!/usr/bin/env python3
"""Trim FFDec-exported Role1 effect timelines to shared per-action bounds."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


SOURCES = {
    "hit1": "DefineSprite_5_Role1Bullet1",
    "hit3": "DefineSprite_22_Role1Bullet3",
    "hit4": "DefineSprite_15_Role1Bullet4",
    "hit5": "DefineSprite_9_Role1Bullet5",
    "hit6": "DefineSprite_56_Role1Bullet6",
    "hit7": "DefineSprite_67_Role1Bullet7",
    "hit8": "DefineSprite_43_Role1Bullet8",
    "hit9": "DefineSprite_78_Role1Bullet9",
    "hit10": "DefineSprite_201_Role1Bullet10_2",
    "hit11_1": "DefineSprite_100_Role1Bullet11_1",
    "hit11_2": "DefineSprite_101_Role1Bullet11_2",
    "hit12": "DefineSprite_140_Role1Bullet12",
    "hit13": "DefineSprite_218_Role1Bullet13",
    "hit14": "DefineSprite_206_Role1Bullet14_1",
}


def numeric_frames(directory: Path) -> list[Path]:
    return sorted(directory.glob("*.png"), key=lambda path: int(path.stem))


def union_box(frames: list[Image.Image], padding: int) -> tuple[int, int, int, int]:
    boxes = [frame.getchannel("A").getbbox() for frame in frames]
    nonempty = [box for box in boxes if box is not None]
    if not nonempty:
        raise ValueError("animation has no visible pixels")
    left = max(0, min(box[0] for box in nonempty) - padding)
    top = max(0, min(box[1] for box in nonempty) - padding)
    right = min(frames[0].width, max(box[2] for box in nonempty) + padding)
    bottom = min(frames[0].height, max(box[3] for box in nonempty) + padding)
    return left, top, right, bottom


def normalize(source_root: Path, output_root: Path, padding: int) -> dict[str, object]:
    manifest: dict[str, object] = {}
    for action, source_name in SOURCES.items():
        paths = numeric_frames(source_root / source_name)
        if not paths:
            raise FileNotFoundError(source_root / source_name)
        frames = [Image.open(path).convert("RGBA") for path in paths]
        size = frames[0].size
        if any(frame.size != size for frame in frames):
            raise ValueError(f"{action}: source frames do not share one canvas")
        box = union_box(frames, padding)
        action_dir = output_root / action
        action_dir.mkdir(parents=True, exist_ok=True)
        for old in action_dir.glob("*.png"):
            old.unlink()
        for index, frame in enumerate(frames, start=1):
            frame.crop(box).save(action_dir / f"{index:02d}.png", optimize=True)
        manifest[action] = {
            "sourceSymbol": source_name.split("_", 2)[2],
            "frameCount": len(frames),
            "sourceSize": list(size),
            "cropBox": list(box),
            "outputSize": [box[2] - box[0], box[3] - box[1]],
        }
        print(f"{action}: {len(frames)} frames, {size[0]}x{size[1]} -> {box[2] - box[0]}x{box[3] - box[1]}")
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--padding", type=int, default=4)
    args = parser.parse_args()
    normalize(args.source_root, args.output_root, args.padding)


if __name__ == "__main__":
    main()
