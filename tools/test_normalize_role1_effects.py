from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
NORMALIZER_PATH = REPO_ROOT / "tools" / "normalize-role1-effects.py"


def load_normalizer():
    spec = importlib.util.spec_from_file_location("normalize_role1_effects", NORMALIZER_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(NORMALIZER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


normalizer = load_normalizer()


def synthetic_xml(symbols: list[str]) -> str:
    shapes = []
    tags = []
    names = []
    for character_id, symbol in enumerate(symbols, start=1):
        shapes.append(
            f'<item type="DefineShapeTag" shapeId="{character_id}">'
            '<shapeBounds Xmin="-800" Ymin="-400" Xmax="1200" Ymax="600" />'
            '</item>'
        )
        tags.append(f"<item>{character_id}</item>")
        names.append(f"<item>{symbol}</item>")
    return (
        "<swf><tags>"
        + "".join(shapes)
        + '<item type="SymbolClassTag"><tags>'
        + "".join(tags)
        + "</tags><names>"
        + "".join(names)
        + "</names></item></tags></swf>"
    )


def sprite_xml(*, sub_tags: str, symbol: str = "FixtureSymbol") -> str:
    return (
        "<swf><tags>"
        '<item type="DefineShapeTag" shapeId="1">'
        '<shapeBounds Xmin="0" Ymin="0" Xmax="200" Ymax="200" />'
        "</item>"
        f'<item type="DefineSpriteTag" spriteId="2" frameCount="2"><subTags>{sub_tags}</subTags></item>'
        '<item type="SymbolClassTag"><tags><item>2</item></tags><names>'
        f"<item>{symbol}</item>"
        "</names></item></tags></swf>"
    )


def tree_snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class NormalizeRole1EffectsTest(unittest.TestCase):
    def test_cropped_pivot_preserves_symbol_origin(self):
        pivot = normalizer.cropped_pivot(
            symbol_origin_px=(40, 20),
            crop_left=10,
            crop_top=5,
        )
        self.assertEqual(pivot, (30, 15))

    def test_symbol_bounds_are_derived_from_xml_bounds(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(synthetic_xml(["Role1Bullet1"]), encoding="utf-8")

            bounds = normalizer.symbol_bounds_px(xml_path, "Role1Bullet1")

        self.assertEqual(
            bounds,
            {"xmin": -40, "ymin": -20, "xmax": 60, "ymax": 30, "w": 100, "h": 50},
        )

    def test_move_only_place_object_updates_the_existing_depth_bounds(self):
        sub_tags = (
            '<item type="PlaceObject2Tag" characterId="1" depth="1" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
            '<item type="ShowFrameTag" />'
            '<item type="PlaceObject2Tag" depth="1" placeFlagHasCharacter="false" '
            'placeFlagHasMatrix="true" placeFlagMove="true">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="400" translateY="0" />'
            "</item>"
            '<item type="ShowFrameTag" />'
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(sprite_xml(sub_tags=sub_tags), encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "FixtureSymbol")

        self.assertEqual(
            geometry["sourceBoundsPx"],
            {"xmin": 0, "ymin": 0, "xmax": 30, "ymax": 10, "w": 30, "h": 10},
        )

    def test_filter_padding_expands_export_bounds_symmetrically(self):
        sub_tags = (
            '<item type="PlaceObject3Tag" characterId="1" depth="1" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" '
            'placeFlagHasFilterList="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "<surfaceFilterList>"
            '<item type="BLURFILTER" blurX="3.0" blurY="5.0" />'
            '<item type="GLOWFILTER" blurX="8.0" blurY="6.0" />'
            "</surfaceFilterList>"
            "</item>"
            '<item type="ShowFrameTag" />'
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(sprite_xml(sub_tags=sub_tags), encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "FixtureSymbol")

        self.assertEqual(geometry["filterPaddingPx"], {"x": 11, "y": 11})
        self.assertEqual(
            geometry["exportBoundsPx"],
            {"xmin": -11, "ymin": -11, "xmax": 21, "ymax": 21, "w": 32, "h": 32},
        )

    def test_nested_and_direct_filter_padding_take_the_maximum(self):
        xml = (
            "<swf><tags>"
            '<item type="DefineShapeTag" shapeId="1">'
            '<shapeBounds Xmin="0" Ymin="0" Xmax="200" Ymax="200" />'
            "</item>"
            '<item type="DefineSpriteTag" spriteId="2" frameCount="1"><subTags>'
            '<item type="PlaceObject3Tag" characterId="1" depth="1" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" '
            'placeFlagHasFilterList="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            '<surfaceFilterList><item type="BLURFILTER" blurX="3.0" blurY="3.0" /></surfaceFilterList>'
            "</item><item type=\"ShowFrameTag\" />"
            "</subTags></item>"
            '<item type="DefineSpriteTag" spriteId="3" frameCount="1"><subTags>'
            '<item type="PlaceObject3Tag" characterId="2" depth="1" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" '
            'placeFlagHasFilterList="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            '<surfaceFilterList><item type="GLOWFILTER" blurX="8.0" blurY="8.0" /></surfaceFilterList>'
            "</item><item type=\"ShowFrameTag\" />"
            "</subTags></item>"
            '<item type="SymbolClassTag"><tags><item>3</item></tags><names>'
            "<item>FixtureSymbol</item>"
            "</names></item></tags></swf>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(xml, encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "FixtureSymbol")

        self.assertEqual(geometry["filterPaddingPx"], {"x": 8, "y": 8})

    def test_self_cycle_is_skipped_without_losing_noncyclic_bounds(self):
        sub_tags = (
            '<item type="PlaceObject2Tag" characterId="1" depth="1" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
            '<item type="PlaceObject2Tag" characterId="2" depth="2" '
            'placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(sprite_xml(sub_tags=sub_tags), encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "FixtureSymbol")

        self.assertEqual(
            geometry["sourceBoundsPx"],
            {"xmin": 0, "ymin": 0, "xmax": 10, "ymax": 10, "w": 10, "h": 10},
        )
        self.assertEqual(geometry["filterPaddingPx"], {"x": 0, "y": 0})

    def test_mutual_cycle_does_not_cache_partial_child_bounds(self):
        xml = (
            "<swf><tags>"
            '<item type="DefineShapeTag" shapeId="1">'
            '<shapeBounds Xmin="0" Ymin="0" Xmax="200" Ymax="200" />'
            "</item>"
            '<item type="DefineSpriteTag" spriteId="2"><subTags>'
            '<item type="PlaceObject2Tag" characterId="1" depth="1" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
            '<item type="PlaceObject2Tag" characterId="3" depth="2" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="200" translateY="0" />'
            "</item></subTags></item>"
            '<item type="DefineSpriteTag" spriteId="3"><subTags>'
            '<item type="PlaceObject2Tag" characterId="1" depth="1" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
            '<item type="PlaceObject2Tag" characterId="2" depth="2" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="400" translateY="0" />'
            "</item></subTags></item>"
            '<item type="SymbolClassTag"><tags><item>2</item><item>3</item></tags><names>'
            "<item>RootA</item><item>RootB</item>"
            "</names></item></tags></swf>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(xml, encoding="utf-8")
            bounds = normalizer.FFDecBounds(xml_path)

            root_a = bounds.geometry("RootA")
            root_b = bounds.geometry("RootB")

        self.assertEqual(root_a["sourceBoundsPx"]["w"], 20)
        self.assertEqual(root_b["sourceBoundsPx"]["w"], 30)

    def test_deep_acyclic_sprite_nesting_has_no_fixed_depth_limit(self):
        sprites = []
        child_id = 1
        for sprite_id in range(2, 23):
            sprites.append(
                f'<item type="DefineSpriteTag" spriteId="{sprite_id}"><subTags>'
                f'<item type="PlaceObject2Tag" characterId="{child_id}" depth="1" placeFlagMove="false">'
                '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
                "</item></subTags></item>"
            )
            child_id = sprite_id
        xml = (
            "<swf><tags>"
            '<item type="DefineShapeTag" shapeId="1">'
            '<shapeBounds Xmin="0" Ymin="0" Xmax="200" Ymax="200" />'
            "</item>"
            + "".join(sprites)
            + '<item type="SymbolClassTag"><tags><item>22</item></tags><names>'
            "<item>DeepSymbol</item>"
            "</names></item></tags></swf>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(xml, encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "DeepSymbol")

        self.assertEqual(geometry["sourceBoundsPx"]["w"], 10)

    def test_invalid_move_and_place_states_are_ignored(self):
        sub_tags = (
            '<item type="PlaceObject2Tag" characterId="1" depth="1" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            "</item>"
            '<item type="PlaceObject3Tag" characterId="1" depth="1" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="400" translateY="0" />'
            '<surfaceFilterList><item type="GLOWFILTER" blurX="50" blurY="50" /></surfaceFilterList>'
            "</item>"
            '<item type="PlaceObject2Tag" characterId="1" depth="2" placeFlagMove="true">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="600" translateY="0" />'
            "</item>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(sprite_xml(sub_tags=sub_tags), encoding="utf-8")

            geometry = normalizer.symbol_geometry(xml_path, "FixtureSymbol")

        self.assertEqual(geometry["sourceBoundsPx"]["w"], 10)
        self.assertEqual(geometry["filterPaddingPx"], {"x": 0, "y": 0})

    def test_unsupported_filter_reports_role1_capability_boundary(self):
        sub_tags = (
            '<item type="PlaceObject3Tag" characterId="1" depth="1" placeFlagMove="false">'
            '<matrix type="MATRIX" hasRotate="false" hasScale="false" translateX="0" translateY="0" />'
            '<surfaceFilterList><item type="DROPSHADOWFILTER" blurX="4" blurY="4" /></surfaceFilterList>'
            "</item>"
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            xml_path = Path(temporary_directory) / "fixture.xml"
            xml_path.write_text(sprite_xml(sub_tags=sub_tags), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Role1 normalizer.*DROPSHADOWFILTER"):
                normalizer.symbol_geometry(xml_path, "FixtureSymbol")

    def test_numeric_frames_rejects_noncontiguous_numbering(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            Image.new("RGBA", (1, 1)).save(directory / "1.png")
            Image.new("RGBA", (1, 1)).save(directory / "3.png")

            with self.assertRaisesRegex(ValueError, "contiguous.*1.*3"):
                normalizer.numeric_frames(directory)

    def test_normalize_writes_all_actions_with_stable_manifest_shape(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "source"
            output_root = root / "output"
            for source_directory in normalizer.SOURCES.values():
                directory = source_root / source_directory
                directory.mkdir(parents=True)
                Image.new("RGBA", (100, 50), (255, 255, 255, 255)).save(directory / "1.png")
            xml_path = root / "fixture.xml"
            xml_path.write_text(
                synthetic_xml(list(normalizer.SOURCE_SYMBOLS.values())),
                encoding="utf-8",
            )

            manifest = normalizer.normalize(xml_path, source_root, output_root, padding=0)

        self.assertEqual(list(manifest), list(normalizer.SOURCES))
        self.assertEqual(len(manifest), 14)
        self.assertEqual(
            set(manifest["hit1"]),
            {
                "sourceSymbol",
                "frames",
                "fps",
                "scale",
                "pivotPx",
                "sourceBoundsPx",
                "exportBoundsPx",
                "filterPaddingPx",
                "sourceSize",
                "cropBox",
                "outputSize",
                "anchor",
                "offset",
                "followAnchor",
            },
        )
        self.assertEqual(manifest["hit1"]["pivotPx"], {"x": 40, "y": 20})
        self.assertEqual(manifest["hit1"]["anchor"], "hero")
        self.assertEqual(manifest["hit1"]["offset"], {"forward": 120, "y": 5})
        self.assertTrue(manifest["hit1"]["followAnchor"])
        self.assertEqual(manifest["hit12"]["anchor"], "target")

    def test_failed_render_leaves_existing_output_tree_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "source"
            output_root = root / "output"
            for source_directory in normalizer.SOURCES.values():
                directory = source_root / source_directory
                directory.mkdir(parents=True)
                Image.new("RGBA", (100, 50), (255, 255, 255, 255)).save(directory / "1.png")
            xml_path = root / "fixture.xml"
            xml_path.write_text(
                synthetic_xml(list(normalizer.SOURCE_SYMBOLS.values())),
                encoding="utf-8",
            )
            (output_root / "hit1").mkdir(parents=True)
            (output_root / "sentinel.txt").write_text("official output", encoding="utf-8")
            (output_root / "hit1" / "01.png").write_bytes(b"old frame")
            before = tree_snapshot(output_root)

            with patch.object(Image.Image, "save", side_effect=OSError("injected save failure")):
                with self.assertRaisesRegex(OSError, "injected save failure"):
                    normalizer.normalize(xml_path, source_root, output_root, padding=0)

            self.assertEqual(tree_snapshot(output_root), before)
            self.assertEqual(
                {path.name for path in root.iterdir()},
                {"source", "output", "fixture.xml"},
            )


if __name__ == "__main__":
    unittest.main()
