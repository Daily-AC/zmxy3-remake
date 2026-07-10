#!/usr/bin/env python3
"""Extract the official L1/L2 monster hit1 MovieClips with FFDec.

The source `1.swf` contains two deliberately invisible hitbox-only symbols
(Monster7Bullet1 and Monster8Bullet1). They are audited but not shipped as
blank art assets.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SWF = (
    REPO_ROOT
    / "vendor"
    / "zmxy_res"
    / "造梦西游魔改版"
    / "造梦西游3再续天庭最终版"
    / "out_res"
    / "1.swf"
)
DEFAULT_XFL = REPO_ROOT / "tmp" / "official-1.xfl" / "official-1-dec"
DEFAULT_OUT = (
    REPO_ROOT
    / "game"
    / "public"
    / "assets"
    / "extracted"
    / "level1"
    / "hit1-effects"
)
DEFAULT_JAVA = Path("/opt/homebrew/opt/openjdk/bin/java")
DEFAULT_FFDEC = REPO_ROOT / "tools" / "ffdec" / "ffdec-cli.jar"
BOUNDS_HELPER = REPO_ROOT / "tools" / "normalize-role1-effects.py"


EFFECTS = (
    {"monsterId": "Monster30", "sourceSymbol": "Monster30Bullet1", "symbolId": 21},
    {"monsterId": "Monster8", "sourceSymbol": "Monster8Bullet1", "symbolId": 23, "hitboxOnly": True},
    {"monsterId": "Monster7", "sourceSymbol": "Monster7Bullet1", "symbolId": 75, "hitboxOnly": True},
    {"monsterId": "Monster4", "sourceSymbol": "Monster4Bullet1", "symbolId": 52},
    {"monsterId": "Monster3", "sourceSymbol": "Monster3Bullet1", "symbolId": 70},
    {"monsterId": "Monster2", "sourceSymbol": "Monster2Bullet1_1", "symbolId": 49},
    {"monsterId": "Monster2", "sourceSymbol": "Monster2Bullet1_2", "symbolId": 34},
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--swf", type=Path, default=DEFAULT_SWF)
    parser.add_argument("--xfl", type=Path, default=DEFAULT_XFL)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--java", type=Path, default=DEFAULT_JAVA)
    parser.add_argument("--ffdec", type=Path, default=DEFAULT_FFDEC)
    return parser.parse_args()


def load_bounds_helper():
    spec = importlib.util.spec_from_file_location("role1_effect_bounds", BOUNDS_HELPER)
    if spec is None or spec.loader is None:
        raise ImportError(BOUNDS_HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stable_number(value: float) -> int | float:
    rounded = round(value, 6)
    if rounded == 0:
        return 0
    if rounded.is_integer():
        return int(rounded)
    return rounded


def xfl_frame_count(symbol_xml: Path) -> int:
    root = ET.parse(symbol_xml).getroot()
    result = 0
    for frame in root.iter():
        if frame.tag.rsplit("}", 1)[-1] != "DOMFrame":
            continue
        index = int(frame.attrib.get("index", 0))
        duration = int(frame.attrib.get("duration", 1))
        result = max(result, index + duration)
    return result


def all_alpha_zero(frames: list[Path]) -> bool:
    return all(Image.open(path).convert("RGBA").getchannel("A").getbbox() is None for path in frames)


def frame_pixels(image: Image.Image) -> dict[str, object]:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    return {
        "alphaBoundsPx": list(bounds) if bounds is not None else None,
        "nonTransparentPixels": sum(pixel > 0 for pixel in alpha.getdata()),
    }


def numeric_frames(directory: Path) -> list[Path]:
    frames = list(directory.glob("*.png"))
    frames.sort(key=lambda path: int(path.stem))
    expected = list(range(1, len(frames) + 1))
    if [int(path.stem) for path in frames] != expected:
        raise ValueError(f"{directory}: non-contiguous FFDec frame sequence")
    return frames


def run_ffdec(
    java: Path,
    ffdec: Path,
    swf: Path,
    effect: dict[str, object],
    raw_root: Path,
) -> list[Path]:
    symbol_id = int(effect["symbolId"])
    source_symbol = str(effect["sourceSymbol"])
    destination = raw_root / str(symbol_id)
    subprocess.run(
        [
            str(java),
            "-Djava.awt.headless=true",
            "-jar",
            str(ffdec),
            "-selectid",
            str(symbol_id),
            "-format",
            "sprite:png",
            "-export",
            "sprite",
            str(destination),
            str(swf),
        ],
        check=True,
    )
    rendered = destination / f"DefineSprite_{symbol_id}_{source_symbol}"
    if not rendered.is_dir():
        raise FileNotFoundError(f"FFDec did not render {source_symbol}: {rendered}")
    return numeric_frames(rendered)


def main() -> None:
    args = parse_args()
    for required in (args.swf, args.xfl, args.java, args.ffdec):
        if not required.exists():
            raise FileNotFoundError(required)

    bounds_helper = load_bounds_helper()
    frame_rate = float(ET.parse(args.xfl / "DOMDocument.xml").getroot().attrib["frameRate"])

    with tempfile.TemporaryDirectory(prefix="monster-hit1-") as temporary:
        temp_root = Path(temporary)
        raw_root = temp_root / "raw"
        staged_out = temp_root / "out"
        raw_root.mkdir()
        staged_out.mkdir()

        swf_xml = temp_root / "1.xml"
        subprocess.run(
            [
                str(args.java),
                "-Djava.awt.headless=true",
                "-jar",
                str(args.ffdec),
                "-swf2xml",
                str(args.swf),
                str(swf_xml),
            ],
            check=True,
        )
        bounds = bounds_helper.FFDecBounds(swf_xml)

        manifest_effects: dict[str, object] = {}
        for effect in EFFECTS:
            source_symbol = str(effect["sourceSymbol"])
            symbol_id = int(effect["symbolId"])
            frames = run_ffdec(args.java, args.ffdec, args.swf, effect, raw_root)
            timeline_frames = xfl_frame_count(args.xfl / "LIBRARY" / f"Symbol {symbol_id}.xml")
            if len(frames) != timeline_frames:
                raise ValueError(
                    f"{source_symbol}: FFDec rendered {len(frames)} frames, "
                    f"XFL declares {timeline_frames}"
                )

            images = [Image.open(path).convert("RGBA") for path in frames]
            canvas_sizes = {image.size for image in images}
            if len(canvas_sizes) != 1:
                raise ValueError(f"{source_symbol}: unstable FFDec canvas sizes {canvas_sizes}")
            width, height = next(iter(canvas_sizes))
            visible_frames = sum(image.getchannel("A").getbbox() is not None for image in images)
            hitbox_only = bool(effect.get("hitboxOnly", False))
            if hitbox_only != all_alpha_zero(frames):
                raise ValueError(
                    f"{source_symbol}: hitbox-only audit disagrees with rendered alpha"
                )

            source_bounds = bounds.rect(symbol_id)
            if source_bounds is None:
                raise ValueError(f"{source_symbol}: missing SWF bounds")
            xmin, ymin, xmax, ymax = source_bounds
            pivot = {
                "x": stable_number(-xmin / 20),
                "y": stable_number(-ymin / 20),
            }
            source_bounds_px = {
                "xmin": stable_number(xmin / 20),
                "ymin": stable_number(ymin / 20),
                "xmax": stable_number(xmax / 20),
                "ymax": stable_number(ymax / 20),
            }

            asset_path = None
            shipped_frames = 0
            pixels: list[dict[str, object]] = []
            if not hitbox_only:
                output_directory = staged_out / source_symbol
                output_directory.mkdir()
                for index, (source, image) in enumerate(zip(frames, images), start=1):
                    target = output_directory / f"{index:02d}.png"
                    shutil.copyfile(source, target)
                    pixels.append(frame_pixels(image))
                shipped_frames = len(frames)
                asset_path = f"assets/extracted/level1/hit1-effects/{source_symbol}"

            manifest_effects[source_symbol] = {
                "monsterId": effect["monsterId"],
                "sourceSymbol": source_symbol,
                "symbolId": symbol_id,
                "kind": "hitbox-only" if hitbox_only else "visual",
                "timelineFrames": timeline_frames,
                "shippedFrames": shipped_frames,
                "visibleFrames": visible_frames,
                "fps": stable_number(frame_rate),
                "canvasPx": {"width": width, "height": height},
                "sourceBoundsPx": source_bounds_px,
                "pivotPx": pivot,
                "assetPath": asset_path,
                "framePixels": pixels,
            }

        manifest = {
            "source": {
                "swf": "out_res/1.swf",
                "sha256": hashlib.sha256(args.swf.read_bytes()).hexdigest(),
                "xfl": "official-1-dec",
                "renderer": "JPEXS FFDec sprite:png",
            },
            "effects": manifest_effects,
        }
        (staged_out / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        if args.out.exists():
            shutil.rmtree(args.out)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(staged_out, args.out)


if __name__ == "__main__":
    main()
