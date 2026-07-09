import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import extract_scene_geometry


class ExtractSceneGeometryTest(unittest.TestCase):
    def test_extracts_wall_bounds_from_named_marker_sprite(self):
        with tempfile.TemporaryDirectory() as tmp:
            xml_path = Path(tmp) / "fixture.xml"
            xml_path.write_text(
                """<swf><tags>
  <item type="DefineShapeTag" shapeId="10">
    <shapeBounds type="RECT" Xmin="-20" Ymin="0" Xmax="80" Ymax="40"/>
  </item>
  <item type="DefineSpriteTag" spriteId="11">
    <subTags><item type="ShowFrameTag"/></subTags>
  </item>
  <item type="DefineSpriteTag" spriteId="12">
    <subTags>
      <item type="PlaceObject2Tag" characterId="10" depth="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true">
        <matrix type="MATRIX" hasScale="true" hasRotate="false" scaleX="2" scaleY="0.5" translateX="100" translateY="-40"/>
      </item>
      <item type="PlaceObject2Tag" characterId="11" depth="2" name="isThroughWall" placeFlagHasCharacter="true" placeFlagHasName="true" placeFlagHasMatrix="true">
        <matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="-1000" translateY="-60"/>
      </item>
      <item type="ShowFrameTag"/>
    </subTags>
  </item>
  <item type="DefineSpriteTag" spriteId="195">
    <subTags>
      <item type="PlaceObject2Tag" characterId="12" depth="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true">
        <matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="400" translateY="-200"/>
      </item>
      <item type="ShowFrameTag"/>
    </subTags>
  </item>
</tags></swf>""",
                encoding="utf-8",
            )

            geometry, report = extract_scene_geometry.extract_geometry(xml_path)

        self.assertEqual(report["marker_inventory"], {"isThroughWall": 1})
        self.assertEqual(geometry["subStages"][0]["id"], "sl11")
        self.assertEqual(
            geometry["subStages"][0]["walls"],
            [
                {
                    "type": "through",
                    "x": 23,
                    "y": -12,
                    "width": 10,
                    "height": 1,
                    "rotation": 0,
                }
            ],
        )

    def test_validator_rejects_empty_sections(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad_json = Path(tmp) / "bad.json"
            bad_json.write_text(
                json.dumps(
                    {
                        "meta": {},
                        "subStages": [
                            {"id": "sl11", "walls": [], "transferDoors": [], "markers": []},
                            {"id": "sl12", "walls": [], "transferDoors": [], "markers": []},
                            {"id": "sl13", "walls": [], "transferDoors": [], "markers": []},
                        ],
                    }
                ),
                encoding="utf-8",
            )

            proc = subprocess.run(
                [sys.executable, "tools/level1-geometry/validate_level1_geometry.py", str(bad_json)],
                cwd=Path(__file__).resolve().parents[2],
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(proc.returncode, 1)
        self.assertIn("sl11 walls must be non-empty", proc.stdout)


if __name__ == "__main__":
    unittest.main()
