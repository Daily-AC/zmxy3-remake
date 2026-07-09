#!/usr/bin/env python3
"""Extract level 1 collision geometry from an FFDec SWF XML dump."""

from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

TWIPS_PER_PX = 20.0

SCENE_SYMBOLS = {
    "sl11": 195,
    "sl12": 209,
    "sl13": 211,
}

WALL_MARKERS = {
    "isWall": "solid",
    "isThroughWall": "through",
    "isThroughUpButDownWall": "throughUpButDown",
    "isThroughDownButUpWall": "throughDownButUp",
}

TRANSFER_DOOR_MARKER = "isTransferDoor"

KNOWN_MARKER_NAMES = {
    *WALL_MARKERS.keys(),
    TRANSFER_DOOR_MARKER,
    "noContinueGo",
    "monsterDisapperaPoint",
    "isHideWall",
    "stophere",
}

DEFAULT_XML = Path("tmp/level1-geometry/main.xml")
DEFAULT_OUTPUT = Path("game/src/data/levels/level1-geometry.json")
DEFAULT_DEBUG_OUTPUT = Path("tmp/level1-geometry/extraction-debug.json")


def px(twips: str | int | float) -> float:
    return float(twips) / TWIPS_PER_PX


def clean_number(value: float) -> int | float:
    if abs(value) < 0.0005:
        value = 0.0
    rounded = round(value)
    if abs(value - rounded) < 0.0005:
        return int(rounded)
    return round(value, 3)


def rect_from_shape_bounds(elem: ET.Element) -> tuple[float, float, float, float] | None:
    bounds = elem.find("shapeBounds")
    if bounds is None:
        return None
    xmin = px(bounds.attrib["Xmin"])
    ymin = px(bounds.attrib["Ymin"])
    xmax = px(bounds.attrib["Xmax"])
    ymax = px(bounds.attrib["Ymax"])
    return xmin, ymin, xmax, ymax


def matrix_from_elem(elem: ET.Element | None) -> tuple[float, float, float, float, float, float]:
    if elem is None:
        return 1.0, 0.0, 0.0, 1.0, 0.0, 0.0
    attrs = elem.attrib
    a = float(attrs.get("scaleX", "1"))
    b = float(attrs.get("rotateSkew0", "0"))
    c = float(attrs.get("rotateSkew1", "0"))
    d = float(attrs.get("scaleY", "1"))
    tx = px(attrs.get("translateX", "0"))
    ty = px(attrs.get("translateY", "0"))
    return a, b, c, d, tx, ty


def multiply_matrix(
    left: tuple[float, float, float, float, float, float],
    right: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    la, lb, lc, ld, ltx, lty = left
    ra, rb, rc, rd, rtx, rty = right
    return (
        la * ra + lc * rb,
        lb * ra + ld * rb,
        la * rc + lc * rd,
        lb * rc + ld * rd,
        la * rtx + lc * rty + ltx,
        lb * rtx + ld * rty + lty,
    )


def transform_rect(
    rect: tuple[float, float, float, float],
    matrix: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float]:
    xmin, ymin, xmax, ymax = rect
    a, b, c, d, tx, ty = matrix
    corners = (
        (xmin, ymin),
        (xmax, ymin),
        (xmax, ymax),
        (xmin, ymax),
    )
    points = [(a * x + c * y + tx, b * x + d * y + ty) for x, y in corners]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def union_rects(rects: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float] | None:
    if not rects:
        return None
    return (
        min(rect[0] for rect in rects),
        min(rect[1] for rect in rects),
        max(rect[2] for rect in rects),
        max(rect[3] for rect in rects),
    )


def rect_to_json(rect: tuple[float, float, float, float]) -> dict[str, int | float]:
    xmin, ymin, xmax, ymax = rect
    return {
        "x": clean_number(xmin),
        "y": clean_number(ymin),
        "width": clean_number(xmax - xmin),
        "height": clean_number(ymax - ymin),
    }


def rotation_degrees(matrix: tuple[float, float, float, float, float, float]) -> int | float:
    a, b, c, d, _tx, _ty = matrix
    if abs(b) < 0.000001 and abs(c) < 0.000001:
        return 0
    if abs(a) > 0.000001 or abs(b) > 0.000001:
        return clean_number(math.degrees(math.atan2(b, a)))
    return clean_number(math.degrees(math.atan2(d, c)) - 90.0)


def parse_sprite(elem: ET.Element) -> list[dict]:
    placements = []
    sub_tags = elem.find("subTags")
    if sub_tags is None:
        return placements
    for child in sub_tags:
        tag_type = child.attrib.get("type", "")
        if not tag_type.startswith("PlaceObject"):
            continue
        character_id = child.attrib.get("characterId")
        if character_id is None:
            continue
        matrix = matrix_from_elem(child.find("matrix"))
        placements.append(
            {
                "characterId": int(character_id),
                "depth": int(child.attrib.get("depth", "0")),
                "name": child.attrib.get("name"),
                "matrix": matrix,
                "type": tag_type,
            }
        )
    placements.sort(key=lambda item: item["depth"])
    return placements


def load_definitions(xml_path: Path) -> tuple[dict[int, tuple[float, float, float, float]], dict[int, list[dict]]]:
    shapes: dict[int, tuple[float, float, float, float]] = {}
    sprites: dict[int, list[dict]] = {}
    stack: list[str] = []

    for event, elem in ET.iterparse(xml_path, events=("start", "end")):
        if event == "start":
            stack.append(elem.tag)
            continue
        is_top_level_item = elem.tag == "item" and len(stack) == 3 and stack[-2] == "tags"
        if is_top_level_item:
            tag_type = elem.attrib.get("type", "")
            if tag_type.startswith("DefineShape") and "shapeId" in elem.attrib:
                rect = rect_from_shape_bounds(elem)
                if rect is not None:
                    shapes[int(elem.attrib["shapeId"])] = rect
            elif tag_type == "DefineSpriteTag" and "spriteId" in elem.attrib:
                sprites[int(elem.attrib["spriteId"])] = parse_sprite(elem)
            elem.clear()
        stack.pop()
    return shapes, sprites


def marker_names_for_sprite(sprite_id: int, sprites: dict[int, list[dict]]) -> list[str]:
    return [
        placement["name"]
        for placement in sprites.get(sprite_id, [])
        if placement.get("name") in KNOWN_MARKER_NAMES
    ]


def all_named_children_for_sprite(sprite_id: int, sprites: dict[int, list[dict]]) -> list[str]:
    return [
        placement["name"]
        for placement in sprites.get(sprite_id, [])
        if placement.get("name")
    ]


def character_bounds(
    character_id: int,
    shapes: dict[int, tuple[float, float, float, float]],
    sprites: dict[int, list[dict]],
    *,
    ignore_marker_children: bool = True,
    seen: set[int] | None = None,
) -> tuple[float, float, float, float] | None:
    if character_id in shapes:
        return shapes[character_id]
    if character_id not in sprites:
        return None
    if seen is None:
        seen = set()
    if character_id in seen:
        return None
    seen.add(character_id)

    rects = []
    skipped_marker = False
    for placement in sprites[character_id]:
        if ignore_marker_children and placement.get("name") in KNOWN_MARKER_NAMES:
            skipped_marker = True
            continue
        child_bounds = character_bounds(
            placement["characterId"],
            shapes,
            sprites,
            ignore_marker_children=ignore_marker_children,
            seen=seen.copy(),
        )
        if child_bounds is not None:
            rects.append(transform_rect(child_bounds, placement["matrix"]))
    bounds = union_rects(rects)
    if bounds is None and skipped_marker:
        return character_bounds(
            character_id,
            shapes,
            sprites,
            ignore_marker_children=False,
            seen=set(),
        )
    return bounds


def extract_geometry(xml_path: Path) -> tuple[dict, dict]:
    shapes, sprites = load_definitions(xml_path)
    sub_stages = []
    marker_inventory: dict[str, int] = {}
    unknown_named_children: dict[str, list[str]] = {}
    missing_bounds = []
    nonzero_rotation_walls = []
    source_objects = {}

    for sub_stage_id, sprite_id in SCENE_SYMBOLS.items():
        walls = []
        transfer_doors = []
        markers = []
        source_objects[sub_stage_id] = []
        scene_placements = sprites.get(sprite_id, [])

        for placement in scene_placements:
            child_id = placement["characterId"]
            marker_names = marker_names_for_sprite(child_id, sprites)
            if not marker_names:
                continue

            for name in marker_names:
                marker_inventory[name] = marker_inventory.get(name, 0) + 1

            named_children = all_named_children_for_sprite(child_id, sprites)
            extras = sorted(name for name in named_children if name not in KNOWN_MARKER_NAMES)
            if extras:
                unknown_named_children[f"{sub_stage_id}:{child_id}"] = extras

            local_bounds = character_bounds(child_id, shapes, sprites, ignore_marker_children=True)
            if local_bounds is None:
                rect = (
                    placement["matrix"][4],
                    placement["matrix"][5],
                    placement["matrix"][4],
                    placement["matrix"][5],
                )
                missing_bounds.append({"subStage": sub_stage_id, "characterId": child_id, "markers": marker_names})
            else:
                rect = transform_rect(local_bounds, placement["matrix"])
            base_rect = rect_to_json(rect)

            source_objects[sub_stage_id].append(
                {
                    "characterId": child_id,
                    "depth": placement["depth"],
                    "markers": marker_names,
                    **base_rect,
                }
            )

            for marker_name in marker_names:
                if marker_name in WALL_MARKERS:
                    rotation = rotation_degrees(placement["matrix"])
                    wall = {
                        "type": WALL_MARKERS[marker_name],
                        **base_rect,
                        "rotation": rotation,
                    }
                    walls.append(wall)
                    if rotation != 0:
                        nonzero_rotation_walls.append(
                            {
                                "subStage": sub_stage_id,
                                "characterId": child_id,
                                "depth": placement["depth"],
                                **wall,
                            }
                        )
                elif marker_name == TRANSFER_DOOR_MARKER:
                    transfer_doors.append(dict(base_rect))
                else:
                    markers.append({"name": marker_name, **base_rect})

        sub_stages.append(
            {
                "id": sub_stage_id,
                "walls": walls,
                "transferDoors": transfer_doors,
                "markers": markers,
            }
        )

    geometry = {
        "meta": {
            "source": "打开我开始玩.swf DefineSprite 195/209/211",
            "units": "px (twips/20), original scene coords",
            "tool": "tools/level1-geometry/extract_scene_geometry.py",
        },
        "subStages": sub_stages,
    }
    report = {
        "marker_inventory": marker_inventory,
        "unknown_named_children": unknown_named_children,
        "missing_bounds": missing_bounds,
        "nonzero_rotation_walls": nonzero_rotation_walls,
        "source_objects": source_objects,
        "shape_count": len(shapes),
        "sprite_count": len(sprites),
    }
    return geometry, report


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xml", type=Path, default=DEFAULT_XML)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--debug-output", type=Path, default=DEFAULT_DEBUG_OUTPUT)
    args = parser.parse_args()

    geometry, report = extract_geometry(args.xml)
    write_json(args.output, geometry)
    write_json(args.debug_output, report)
    print(f"wrote {args.output}")
    print(f"wrote {args.debug_output}")
    for sub_stage in geometry["subStages"]:
        counts = {wall_type: 0 for wall_type in WALL_MARKERS.values()}
        for wall in sub_stage["walls"]:
            counts[wall["type"]] += 1
        print(
            f"{sub_stage['id']}: walls={counts} "
            f"transferDoors={len(sub_stage['transferDoors'])} markers={len(sub_stage['markers'])}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
