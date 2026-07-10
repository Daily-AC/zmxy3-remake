#!/usr/bin/env python3
"""Trim FFDec-exported Role1 effects while preserving SWF symbol origins."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XML = REPO_ROOT / "game" / "tmp" / "role1v690.xml"
DEFAULT_SOURCE_ROOT = REPO_ROOT / "game" / "tmp" / "role1v690-sprites"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "game" / "public" / "assets" / "extracted" / "role1-effects"
PREFAB_COMPILER_PATH = REPO_ROOT / "tools" / "prefab-compiler" / "compiler.py"

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

SOURCE_SYMBOLS = {
    action: source_directory.split("_", 2)[2]
    for action, source_directory in SOURCES.items()
}

ACTION_SPECS = {
    "hit1": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": 120, "y": 5}, "followAnchor": True},
    "hit3": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": 30, "y": -110}, "followAnchor": True},
    "hit4": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": 160, "y": -10}, "followAnchor": True},
    "hit5": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": 165, "y": -20}, "followAnchor": True},
    "hit6": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": 30, "y": 40}, "followAnchor": True},
    "hit7": {"fps": 30, "scale": 1, "anchor": "hero", "offset": {"forward": 175, "y": -30}, "followAnchor": True},
    "hit8": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": -20, "y": 30}, "followAnchor": True},
    "hit9": {"fps": 30, "scale": 1, "anchor": "hero", "offset": {"forward": 120, "y": -50}, "followAnchor": True},
    "hit10": {"fps": 30, "scale": 1, "anchor": "hero", "offset": {"forward": 150, "y": -35}, "followAnchor": False},
    "hit11_1": {"fps": 30, "scale": 1, "anchor": "hero", "offset": {"forward": 50, "y": -50}, "followAnchor": True},
    "hit11_2": {"fps": 30, "scale": 1, "anchor": "hero", "offset": {"forward": 0, "y": -50}, "followAnchor": True},
    "hit12": {"fps": 24, "scale": 1, "anchor": "target", "offset": {"forward": 0, "y": 0}, "followAnchor": False},
    "hit13": {"fps": 30, "scale": 1, "anchor": "target", "offset": {"forward": 0, "y": 0}, "followAnchor": False},
    "hit14": {"fps": 24, "scale": 1, "anchor": "hero", "offset": {"forward": -15, "y": -85}, "followAnchor": False},
}


def load_prefab_compiler():
    spec = importlib.util.spec_from_file_location("prefab_compiler", PREFAB_COMPILER_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(PREFAB_COMPILER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PREFAB_COMPILER = load_prefab_compiler()


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


def cropped_pivot(
    symbol_origin_px: tuple[float, float],
    crop_left: int,
    crop_top: int,
) -> tuple[float, float]:
    return symbol_origin_px[0] - crop_left, symbol_origin_px[1] - crop_top


def stable_number(value: float) -> int | float:
    rounded = round(value, 6)
    if rounded == 0:
        return 0
    if rounded.is_integer():
        return int(rounded)
    return rounded


def bounds_px(bounds_twips: tuple[int, int, int, int]) -> dict[str, int | float]:
    xmin, ymin, xmax, ymax = bounds_twips
    return {
        "xmin": stable_number(xmin / 20),
        "ymin": stable_number(ymin / 20),
        "xmax": stable_number(xmax / 20),
        "ymax": stable_number(ymax / 20),
        "w": stable_number((xmax - xmin) / 20),
        "h": stable_number((ymax - ymin) / 20),
    }


def truncated_xform(bounds: tuple[int, int, int, int], matrix: tuple) -> tuple[int, int, int, int]:
    sx, rotate_skew_0, rotate_skew_1, sy, tx, ty = matrix
    points = (
        (bounds[0], bounds[1]),
        (bounds[2], bounds[1]),
        (bounds[0], bounds[3]),
        (bounds[2], bounds[3]),
    )
    transformed = (
        (sx * x + rotate_skew_1 * y + tx, rotate_skew_0 * x + sy * y + ty)
        for x, y in points
    )
    transformed_points = list(transformed)
    xs = [point[0] for point in transformed_points]
    ys = [point[1] for point in transformed_points]
    return int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))


class FFDecBounds:
    """Reproduces FFDec's sprite rect and filter-padding export calculations."""

    def __init__(self, xml_path: Path):
        self.index = PREFAB_COMPILER.SwfIndex(str(xml_path))
        self._rect_cache: dict[int, tuple[int, int, int, int] | None] = {}
        self._filter_cache: dict[int, tuple[int, int]] = {}

    @staticmethod
    def _sub_tags(sprite: Any) -> list[Any]:
        sub_tags = sprite.find("subTags")
        return list(sub_tags if sub_tags is not None else sprite)

    @staticmethod
    def _is_place_object(tag: Any) -> bool:
        return (tag.get("type") or "").startswith("PlaceObject")

    @staticmethod
    def _is_remove_object(tag: Any) -> bool:
        return (tag.get("type") or "").startswith("RemoveObject")

    @staticmethod
    def _updated_display_entry(tag: Any, previous: dict[str, Any] | None) -> dict[str, Any]:
        is_move = tag.get("placeFlagMove") == "true"
        entry = dict(previous) if is_move and previous is not None else {}

        character_id = tag.get("characterId")
        if character_id is not None:
            entry["characterId"] = int(character_id)

        matrix_element = next((child for child in tag if child.get("type") == "MATRIX"), None)
        if matrix_element is not None:
            entry["matrix"] = PREFAB_COMPILER.matrix_of(tag)
        elif "matrix" not in entry:
            entry["matrix"] = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

        filter_list = tag.find("surfaceFilterList")
        if filter_list is not None:
            entry["filters"] = list(filter_list)
        elif "filters" not in entry:
            entry["filters"] = []
        return entry

    def rect(self, character_id: int, depth: int = 0) -> tuple[int, int, int, int] | None:
        if character_id in self._rect_cache:
            return self._rect_cache[character_id]
        if depth > PREFAB_COMPILER.MAX_RECURSION_DEPTH:
            raise ValueError(f"bounds recursion exceeded at character {character_id}")

        if character_id not in self.index.sprites:
            leaf_bounds = PREFAB_COMPILER.recursive_bounds(self.index, character_id)
            result = tuple(int(value) for value in leaf_bounds) if leaf_bounds is not None else None
            self._rect_cache[character_id] = result
            return result

        display: dict[int, dict[str, Any]] = {}
        result = None
        for tag in self._sub_tags(self.index.sprites[character_id]):
            if self._is_place_object(tag):
                tag_depth = int(tag.get("depth", 0))
                entry = self._updated_display_entry(tag, display.get(tag_depth))
                display[tag_depth] = entry
                child_id = entry.get("characterId")
                if child_id is None:
                    continue
                child_bounds = self.rect(child_id, depth + 1)
                if child_bounds is None:
                    continue
                placed_bounds = truncated_xform(child_bounds, entry["matrix"])
                result = PREFAB_COMPILER.union(result, placed_bounds)
            elif self._is_remove_object(tag):
                display.pop(int(tag.get("depth", 0)), None)

        self._rect_cache[character_id] = result
        return result

    @staticmethod
    def _direct_filter_padding(filters: list[Any]) -> tuple[int, int]:
        delta_x = 0.0
        delta_y = 0.0
        for filter_tag in filters:
            if filter_tag.get("enabled") == "false":
                continue
            filter_type = filter_tag.get("type") or ""
            if filter_type == "COLORMATRIXFILTER":
                continue
            if filter_type not in {"BLURFILTER", "GLOWFILTER"}:
                raise ValueError(f"unsupported FFDec filter type: {filter_type}")
            delta_x += float(filter_tag.get("blurX", 0))
            delta_y += float(filter_tag.get("blurY", 0))
        return math.ceil(delta_x) * 20, math.ceil(delta_y) * 20

    def filter_padding(self, character_id: int, depth: int = 0) -> tuple[int, int]:
        if character_id in self._filter_cache:
            return self._filter_cache[character_id]
        if depth > PREFAB_COMPILER.MAX_RECURSION_DEPTH:
            raise ValueError(f"filter recursion exceeded at character {character_id}")
        if character_id not in self.index.sprites:
            return 0, 0

        display: dict[int, dict[str, Any]] = {}
        maximum_x = 0
        maximum_y = 0
        for tag in self._sub_tags(self.index.sprites[character_id]):
            if self._is_place_object(tag):
                tag_depth = int(tag.get("depth", 0))
                entry = self._updated_display_entry(tag, display.get(tag_depth))
                display[tag_depth] = entry
                child_id = entry.get("characterId")
                if child_id is None:
                    continue
                child_x, child_y = self.filter_padding(child_id, depth + 1)
                direct_x, direct_y = self._direct_filter_padding(entry["filters"])
                maximum_x = max(maximum_x, child_x, direct_x)
                maximum_y = max(maximum_y, child_y, direct_y)
            elif self._is_remove_object(tag):
                display.pop(int(tag.get("depth", 0)), None)

        result = maximum_x, maximum_y
        self._filter_cache[character_id] = result
        return result

    def geometry(self, symbol: str) -> dict[str, object]:
        character_id = self.index.resolve(symbol)
        source_bounds = self.rect(character_id)
        if source_bounds is None:
            raise ValueError(f"{symbol}: no XML bounds")
        filter_x, filter_y = self.filter_padding(character_id)
        export_bounds = (
            source_bounds[0] - filter_x,
            source_bounds[1] - filter_y,
            source_bounds[2] + filter_x,
            source_bounds[3] + filter_y,
        )
        return {
            "sourceBoundsTwips": source_bounds,
            "exportBoundsTwips": export_bounds,
            "sourceBoundsPx": bounds_px(source_bounds),
            "exportBoundsPx": bounds_px(export_bounds),
            "filterPaddingPx": {"x": stable_number(filter_x / 20), "y": stable_number(filter_y / 20)},
        }


def symbol_geometry(xml_path: Path, symbol: str) -> dict[str, object]:
    return FFDecBounds(xml_path).geometry(symbol)


def symbol_bounds_px(xml_path: Path, symbol: str) -> dict[str, int | float]:
    return symbol_geometry(xml_path, symbol)["sourceBoundsPx"]  # type: ignore[return-value]


def normalize(xml_path: Path, source_root: Path, output_root: Path, padding: int) -> dict[str, object]:
    bounds = FFDecBounds(xml_path)
    prepared: list[dict[str, Any]] = []
    for action, source_directory in SOURCES.items():
        paths = numeric_frames(source_root / source_directory)
        if not paths:
            raise FileNotFoundError(source_root / source_directory)
        with Image.open(paths[0]) as first_frame:
            size = first_frame.size
        for path in paths[1:]:
            with Image.open(path) as frame:
                if frame.size != size:
                    raise ValueError(f"{action}: source frames do not share one canvas")

        geometry = bounds.geometry(SOURCE_SYMBOLS[action])
        export_bounds_twips = geometry["exportBoundsTwips"]
        expected_size = (
            math.ceil((export_bounds_twips[2] - export_bounds_twips[0]) / 20),
            math.ceil((export_bounds_twips[3] - export_bounds_twips[1]) / 20),
        )
        if expected_size != size:
            raise ValueError(
                f"{action}: XML export bounds require {expected_size[0]}x{expected_size[1]} canvas, "
                f"PNG frames are {size[0]}x{size[1]}"
            )

        prepared.append({
            "action": action,
            "paths": paths,
            "sourceSize": size,
            "geometry": geometry,
        })

    manifest: dict[str, object] = {}
    output_root.mkdir(parents=True, exist_ok=True)
    for item in prepared:
        action = item["action"]
        frames = []
        for path in item["paths"]:
            with Image.open(path) as frame:
                frames.append(frame.convert("RGBA"))
        size = item["sourceSize"]
        geometry = item["geometry"]
        box = union_box(frames, padding)
        export_bounds_twips = geometry["exportBoundsTwips"]
        symbol_origin = (-export_bounds_twips[0] / 20, -export_bounds_twips[1] / 20)
        pivot_x, pivot_y = cropped_pivot(symbol_origin, box[0], box[1])
        pivot = {"x": stable_number(pivot_x), "y": stable_number(pivot_y)}
        action_dir = output_root / action
        action_dir.mkdir(parents=True, exist_ok=True)
        for old in action_dir.glob("*.png"):
            old.unlink()
        for index, frame in enumerate(frames, start=1):
            with frame.crop(box) as cropped:
                cropped.save(action_dir / f"{index:02d}.png", optimize=True)
            frame.close()

        spec = ACTION_SPECS[action]
        manifest[action] = {
            "sourceSymbol": SOURCE_SYMBOLS[action],
            "frames": len(frames),
            "fps": spec["fps"],
            "scale": spec["scale"],
            "pivotPx": pivot,
            "sourceBoundsPx": geometry["sourceBoundsPx"],
            "exportBoundsPx": geometry["exportBoundsPx"],
            "filterPaddingPx": geometry["filterPaddingPx"],
            "sourceSize": list(size),
            "cropBox": list(box),
            "outputSize": [box[2] - box[0], box[3] - box[1]],
            "anchor": spec["anchor"],
            "offset": spec["offset"],
            "followAnchor": spec["followAnchor"],
        }
        print(
            f"{action}: {len(frames)} frames, {size[0]}x{size[1]} -> "
            f"{box[2] - box[0]}x{box[3] - box[1]}, "
            f"pivot ({pivot['x']}, {pivot['y']})"
        )

    (output_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", type=Path, default=DEFAULT_XML)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--padding", type=int, default=4)
    args = parser.parse_args()
    normalize(args.xml, args.source_root, args.output_root, args.padding)


if __name__ == "__main__":
    main()
