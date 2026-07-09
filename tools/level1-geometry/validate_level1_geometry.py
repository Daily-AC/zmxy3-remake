#!/usr/bin/env python3
"""Validate the frozen level1-geometry JSON shape."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

EXPECTED_STAGE_IDS = ["sl11", "sl12", "sl13"]
WALL_TYPES = {"solid", "through", "throughUpButDown", "throughDownButUp"}


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_rect(obj: dict, path: str, errors: list[str], *, require_rotation: bool = False) -> None:
    for key in ("x", "y", "width", "height"):
        if key not in obj:
            errors.append(f"{path}.{key} is missing")
        elif not is_number(obj[key]):
            errors.append(f"{path}.{key} must be numeric")
    if is_number(obj.get("width")) and obj["width"] < 0:
        errors.append(f"{path}.width must be non-negative")
    if is_number(obj.get("height")) and obj["height"] < 0:
        errors.append(f"{path}.height must be non-negative")
    if require_rotation:
        if "rotation" not in obj:
            errors.append(f"{path}.rotation is missing")
        elif not is_number(obj["rotation"]):
            errors.append(f"{path}.rotation must be numeric")


def validate_geometry(data: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["root must be an object"]
    if not isinstance(data.get("meta"), dict):
        errors.append("meta must be an object")
    sub_stages = data.get("subStages")
    if not isinstance(sub_stages, list):
        return errors + ["subStages must be an array"]
    ids = [stage.get("id") for stage in sub_stages if isinstance(stage, dict)]
    if ids != EXPECTED_STAGE_IDS:
        errors.append(f"subStages ids must be {EXPECTED_STAGE_IDS}, got {ids}")
    if len(sub_stages) != 3:
        errors.append("subStages must contain exactly three entries")

    total_transfer_doors = 0
    total_markers = 0
    for stage_index, stage in enumerate(sub_stages):
        stage_path = f"subStages[{stage_index}]"
        if not isinstance(stage, dict):
            errors.append(f"{stage_path} must be an object")
            continue
        stage_id = stage.get("id", f"#{stage_index}")
        walls = stage.get("walls")
        transfer_doors = stage.get("transferDoors")
        markers = stage.get("markers")
        if not isinstance(walls, list):
            errors.append(f"{stage_id} walls must be an array")
            walls = []
        if not isinstance(transfer_doors, list):
            errors.append(f"{stage_id} transferDoors must be an array")
            transfer_doors = []
        if not isinstance(markers, list):
            errors.append(f"{stage_id} markers must be an array")
            markers = []
        if not walls:
            errors.append(f"{stage_id} walls must be non-empty")
        total_transfer_doors += len(transfer_doors)
        total_markers += len(markers)

        for wall_index, wall in enumerate(walls):
            path = f"{stage_id}.walls[{wall_index}]"
            if not isinstance(wall, dict):
                errors.append(f"{path} must be an object")
                continue
            if wall.get("type") not in WALL_TYPES:
                errors.append(f"{path}.type must be one of {sorted(WALL_TYPES)}")
            validate_rect(wall, path, errors, require_rotation=True)
        for door_index, door in enumerate(transfer_doors):
            path = f"{stage_id}.transferDoors[{door_index}]"
            if isinstance(door, dict):
                validate_rect(door, path, errors)
            else:
                errors.append(f"{path} must be an object")
        for marker_index, marker in enumerate(markers):
            path = f"{stage_id}.markers[{marker_index}]"
            if not isinstance(marker, dict):
                errors.append(f"{path} must be an object")
                continue
            if not isinstance(marker.get("name"), str) or not marker["name"]:
                errors.append(f"{path}.name must be a non-empty string")
            validate_rect(marker, path, errors)

    if total_transfer_doors == 0:
        errors.append("transferDoors arrays must contain at least one real entry")
    if total_markers == 0:
        errors.append("markers arrays must contain at least one real entry")

    sl11 = next((stage for stage in sub_stages if isinstance(stage, dict) and stage.get("id") == "sl11"), None)
    if sl11 is not None:
        through_count = sum(
            1
            for wall in sl11.get("walls", [])
            if isinstance(wall, dict) and wall.get("type") in {"through", "throughUpButDown", "throughDownButUp"}
        )
        if through_count < 2:
            errors.append("sl11 must contain multiple through-type wall entries")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_path", type=Path)
    args = parser.parse_args()
    data = json.loads(args.json_path.read_text(encoding="utf-8"))
    errors = validate_geometry(data)
    if errors:
        print("FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS")
    print(f"validated {args.json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
