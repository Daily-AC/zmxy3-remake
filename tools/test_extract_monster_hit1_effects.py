#!/usr/bin/env python3
"""Validate shipped official L1/L2 monster hit1 effect frames."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = (
    REPO_ROOT
    / "game"
    / "public"
    / "assets"
    / "extracted"
    / "level1"
    / "hit1-effects"
)


EXPECTED = {
    "Monster30Bullet1": (21, "visual", 10, (254, 144), 10),
    "Monster8Bullet1": (23, "hitbox-only", 1, (150, 150), 0),
    "Monster7Bullet1": (75, "hitbox-only", 1, (150, 150), 0),
    "Monster4Bullet1": (52, "visual", 13, (502, 8), 12),
    "Monster3Bullet1": (70, "visual", 5, (127, 107), 5),
    "Monster2Bullet1_1": (49, "visual", 14, (126, 137), 14),
    "Monster2Bullet1_2": (34, "visual", 20, (157, 68), 5),
}


class MonsterHit1EffectAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads((ASSET_ROOT / "manifest.json").read_text())

    def test_manifest_covers_the_seven_official_symbols(self) -> None:
        effects = self.manifest["effects"]
        self.assertEqual(set(effects), set(EXPECTED))

        for name, (symbol_id, kind, timeline_frames, canvas, visible_frames) in EXPECTED.items():
            with self.subTest(effect=name):
                effect = effects[name]
                self.assertEqual(effect["symbolId"], symbol_id)
                self.assertEqual(effect["kind"], kind)
                self.assertEqual(effect["timelineFrames"], timeline_frames)
                self.assertEqual(
                    (effect["canvasPx"]["width"], effect["canvasPx"]["height"]),
                    canvas,
                )
                self.assertEqual(effect["visibleFrames"], visible_frames)

    def test_visual_frames_have_stable_canvas_and_manifest_pixel_counts(self) -> None:
        for name, effect in self.manifest["effects"].items():
            with self.subTest(effect=name):
                if effect["kind"] == "hitbox-only":
                    self.assertIsNone(effect["assetPath"])
                    self.assertEqual(effect["shippedFrames"], 0)
                    self.assertFalse((ASSET_ROOT / name).exists())
                    continue

                directory = ASSET_ROOT / name
                frames = sorted(directory.glob("*.png"))
                self.assertEqual(len(frames), effect["shippedFrames"])
                self.assertEqual(
                    [path.name for path in frames],
                    [f"{index:02d}.png" for index in range(1, len(frames) + 1)],
                )

                expected_size = (
                    effect["canvasPx"]["width"],
                    effect["canvasPx"]["height"],
                )
                self.assertEqual(len(frames), len(effect["framePixels"]))
                for path, frame_spec in zip(frames, effect["framePixels"]):
                    image = Image.open(path).convert("RGBA")
                    self.assertEqual(image.size, expected_size)
                    alpha = image.getchannel("A")
                    expected_bounds = frame_spec["alphaBoundsPx"]
                    self.assertEqual(
                        alpha.getbbox(),
                        tuple(expected_bounds) if expected_bounds is not None else None,
                    )
                    self.assertEqual(
                        sum(pixel > 0 for pixel in alpha.getdata()),
                        frame_spec["nonTransparentPixels"],
                    )


if __name__ == "__main__":
    unittest.main()
