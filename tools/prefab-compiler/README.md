# zmxy-prefab-compiler

FFDec `-swf2xml` output → deterministic Phaser prefab JSON. Generalizes
`tools/worldmap-deco-origins.py`'s recursive matrix/bounds walker (the math
that produced the human-verified S1 world-map origin fractions) into a full
symbol-tree compiler, so future screens/levels get scene-graph coordinates
"构造即正确" instead of hand-typed-and-overlay-diffed.

## Usage

```bash
JAVA=/opt/homebrew/opt/openjdk/bin/java
FFDEC=tools/ffdec/ffdec-cli.jar
SWF=vendor/zmxy_res/.../out_res/OtherMat1.swf

# 1. swf2xml (the structural source)
$JAVA -Djava.awt.headless=true -jar $FFDEC -swf2xml "$SWF" /tmp/OtherMat1.xml

# 2. real textures (per constituent tag kind -- see "texture resolution" below)
$JAVA -Djava.awt.headless=true -jar $FFDEC -selectid "758,973,931" \
  -format shape:png,button:png -export shape,button /tmp/images "$SWF"

# 3. compile
python3 tools/prefab-compiler/cli.py \
  --xml /tmp/OtherMat1.xml --images /tmp/images \
  --symbol export.shop.PassiveSkillControl --name PassiveSkillControl \
  --out game/tmp/prefab-dev/out \
  --copy-textures-to game/public/assets/extracted/prefab/PassiveSkillControl
```

`--symbol` accepts a numeric characterId or a `SymbolClassTag` class name
(repeatable, pair with `--name` in the same order). Exits non-zero if any
self-check warning fired unless `--allow-warnings` is passed — the compiler
never fails silently.

## Output schema (`<name>.prefab.json`)

```jsonc
{
  "symbol": "export.shop.PassiveSkillControl",
  "characterId": 769,
  "sourceSwf": "OtherMat1.swf",
  "root": {
    "type": "container",              // or "image" / "text"
    "characterId": 769,
    "originFrac": { "x": -0.155, "y": -0.193 },  // symbol-local (0,0) as a fraction of its own bounds
    "boundsPx": { "xmin": .., "ymin": .., "xmax": .., "ymax": .., "w": .., "h": .. },
    "children": [                     // single-frame containers/buttons
      {
        "type": "image", "characterId": 758, "symbolKind": "shape",
        "matrix": { "tx": 0, "ty": 0, "scaleX": 1, "scaleY": 1, "rotSkew0": 0, "rotSkew1": 0 },
        "boundsPx": { ... }, "textureKey": "758", "textureFile": "758.png"
      },
      { "type": "container", "characterId": 768, "instanceName": null,
        "matrix": { "tx": 124.0, "ty": 144.95, ... }, "children": [ ... ] }
    ]
    // multi-frame containers/buttons use "frames": [{ "frame": N, "frameLabel"?: "up"|"over"|"down", "children": [...] }] instead of "children"
  },
  "warnings": []
}
```

Every node's `matrix` is **local to its own parent** (not pre-composed down
the tree) — it maps directly onto a nested Phaser `Container` without any
extra math. `originFrac` is computed the same way
`tools/worldmap-deco-origins.py` computed it (recursive PlaceObject-matrix
chaining down to shape/text bounds, twips/20, button union of the **up**
state only — see `compiler.py`'s module docstring for why that specific
scope is load-bearing, not an oversight).

## Texture resolution

FFDec exports different tag kinds through different exporters with
different filename conventions; the compiler already knows all of them
(`find_exported_png` in `compiler.py`):

| Tag kind | FFDec export command | Filename |
| --- | --- | --- |
| `DefineShape*` | `-format shape:png -export shape` | `<chid>.png` |
| `DefineBits*` (raw bitmap) | `-format image:png -export image` | `<chid>_<name>.png` |
| `DefineSprite` (rendered per-frame) | `-format sprite:png -export sprite` | `DefineSprite_<chid>_<name>/<frame>.png` |
| `DefineButton2` | `-format button:png -export button` | `DefineButton2_<chid>/<frame>_<state>.png` |

**No raster is ever invented.** If a referenced character has no matching
exported PNG under `--images`, the node gets `"textureMissing": true` and a
warning — never a fabricated placeholder. This is the compiler-level
enforcement of the brief's "矢量 shape 无对应位图：记录跳过，不要发明光栅化" rule.

## Sprite flattening (`--flatten-sprite`)

Some sprites are built from vector shapes with gradient/no-bitmap fills that
don't individually image-export (FFDec can still *render* the whole sprite
per frame via `-export sprite`, it just can't hand you each constituent
piece as its own bitmap). `--flatten-sprite <symbol>` stops the compiler
from recursing into that sprite's display list and instead emits it as an
opaque multi-frame raster leaf, one real exported PNG per frame
(`type: "image"`, `symbolKind: "sprite-flattened"`, `frames: [{frame, textureFile}]`).
Still self-checked the same way — a frame with no exported PNG gets
`textureMissing: true`, not a placeholder.

## Self-checks (built in, not optional)

1. **Bounds vs exported PNG size**, ±4px tolerance — logged as a warning
   (and fails the process unless `--allow-warnings`) when they disagree.
2. **twips→px** is applied uniformly (`/20.0`) everywhere a MATRIX or RECT
   is read — never left in twips in the output JSON.
3. **Missing texture ⇒ warning, not fabrication** (see above).
4. **Reference cycles / excessive nesting** (`MAX_RECURSION_DEPTH = 16`) are
   caught and flagged rather than recursing forever.

## Tests

```bash
python3 -m unittest discover -s tools/prefab-compiler/tests -v
```

`tests/fixtures/*.xml` are small pruned closures of `OtherMat1.swf`'s
swf2xml (built with `make_fixture.py`, committed so the tests don't need
`vendor/`/`tmp/` extraction artifacts on disk). `test_origin_regression.py`
locks in the 4 truth values named in the task brief; `test_structure.py`
checks the PassiveSkillControl (Symbol 769) tree against the coordinates
already hand-verified in `tasks/skilltree-report.md` §1.2, plus the
self-check/flatten-sprite/bounds-math primitives.

## Dependencies

Python 3.10+ stdlib only, except `Pillow` for the PNG-size self-check
(`pip install pillow`; only needed when `--images` is passed — the compiler
runs `--allow-warnings`-free without it if you skip texture resolution).
