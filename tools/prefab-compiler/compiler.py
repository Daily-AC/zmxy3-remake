#!/usr/bin/env python3
"""
zmxy-prefab-compiler core library.

Compiles an FFDec `-swf2xml` document into a deterministic Phaser "prefab"
JSON: a nested scene graph (container/image/text nodes), each node carrying
its OWN PlaceObject matrix (tx,ty,scaleX,scaleY,rotSkew0,rotSkew1) relative
to its parent -- i.e. directly Container-nestable, no pre-composition -- plus
a symbol-level origin fraction.

This generalizes tools/worldmap-deco-origins.py (a single-purpose "dump
origin fractions for 6 hardcoded decos" script) into a general symbol-tree
compiler. The origin math in recursive_bounds() is copied VERBATIM from that
script (matrix chaining, twips/20, button state handling) -- do not
"improve" it without re-running tests/test_origin_regression.py, which
locks in the 4 human-verified truth values from tasks/worldmap-report.md:
s1_1=(0.495,0.659), s1_2=(0.460,0.532), llbt=(0.500,0.500),
btnnmg=(0.668,0.487).

Known deliberate fidelity limit inherited from the source script: button
origin bounds union ONLY the "up" state (BUTTONRECORD buttonStateUp), not
over/down -- matches the exact algorithm that produced the truth values
above. A prior report's prose describes an up/over/down union that the
actual script code never implemented; the code (and its verified output) is
the source of truth here, not the prose.
"""
from __future__ import annotations

import glob
import os
import xml.etree.ElementTree as ET
from typing import Optional

Matrix = tuple  # (scaleX, rotSkew0, rotSkew1, scaleY, tx, ty) -- twips for tx/ty

MAX_RECURSION_DEPTH = 16


# ---------------------------------------------------------------------------
# swf2xml indexing
# ---------------------------------------------------------------------------

class SwfIndex:
    """Parses one FFDec `-swf2xml` document into id-keyed tag dicts."""

    def __init__(self, xml_path: str):
        self.path = xml_path
        self.shapes: dict[int, ET.Element] = {}
        self.sprites: dict[int, ET.Element] = {}
        self.buttons: dict[int, ET.Element] = {}
        self.texts: dict[int, ET.Element] = {}       # DefineText(2)/DefineEditText, keyed together
        self.edittexts: dict[int, ET.Element] = {}    # subset of texts that are DefineEditTextTag
        self.bitmaps: dict[int, ET.Element] = {}
        self.symbol_class: dict[str, int] = {}        # class name -> characterId
        self._parse()

    def _parse(self) -> None:
        for _, el in ET.iterparse(self.path):
            t = el.get('type')
            if t == 'DefineSpriteTag':
                self.sprites[int(el.get('spriteId'))] = el
            elif t == 'DefineButton2Tag':
                self.buttons[int(el.get('buttonId'))] = el
            elif t and t.startswith('DefineShape'):
                cid = el.get('shapeId')
                if cid is not None:
                    self.shapes[int(cid)] = el
            elif t == 'DefineEditTextTag':
                cid = el.get('characterId') or el.get('characterID')
                if cid is not None:
                    self.texts[int(cid)] = el
                    self.edittexts[int(cid)] = el
            elif t in ('DefineTextTag', 'DefineText2Tag'):
                cid = el.get('characterId') or el.get('characterID')
                if cid is not None:
                    self.texts[int(cid)] = el
            elif t and t.startswith('DefineBits'):
                cid = el.get('characterId') or el.get('characterID')
                if cid is not None:
                    self.bitmaps[int(cid)] = el
            elif t == 'SymbolClassTag':
                tags_el = el.find('tags')
                names_el = el.find('names')
                if tags_el is not None and names_el is not None:
                    ids = [c.text for c in tags_el]
                    names = [c.text for c in names_el]
                    for cid, nm in zip(ids, names):
                        if cid is not None and nm is not None:
                            self.symbol_class[nm] = int(cid)

    def resolve(self, symbol) -> int:
        """symbol: int characterId, numeric string, or a SymbolClassTag class name."""
        if isinstance(symbol, int):
            return symbol
        s = str(symbol)
        if s.lstrip('-').isdigit():
            return int(s)
        if s in self.symbol_class:
            return self.symbol_class[s]
        raise KeyError(f'unknown symbol {symbol!r}: not a numeric id and not present in this SWF\'s SymbolClassTag')

    def kind_of(self, cid: int) -> str:
        if cid in self.shapes:
            return 'shape'
        if cid in self.sprites:
            return 'sprite'
        if cid in self.buttons:
            return 'button'
        if cid in self.edittexts:
            return 'edittext'
        if cid in self.texts:
            return 'text'
        if cid in self.bitmaps:
            return 'bitmap'
        return 'unknown'


# ---------------------------------------------------------------------------
# matrix / rect helpers (twips) -- ported from worldmap-deco-origins.py
# ---------------------------------------------------------------------------

def matrix_of(el: ET.Element) -> Matrix:
    for c in el:
        if c.get('type') == 'MATRIX':
            tx = float(c.get('translateX', 0))
            ty = float(c.get('translateY', 0))
            sx = float(c.get('scaleX', 1)) if c.get('hasScale') == 'true' else 1.0
            sy = float(c.get('scaleY', 1)) if c.get('hasScale') == 'true' else 1.0
            r0 = float(c.get('rotateSkew0', 0)) if c.get('hasRotate') == 'true' else 0.0
            r1 = float(c.get('rotateSkew1', 0)) if c.get('hasRotate') == 'true' else 0.0
            return (sx, r0, r1, sy, tx, ty)
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def rect(el: ET.Element, tag: str):
    r = el.find(tag)
    if r is None:
        for c in el.iter():
            if c.tag == tag:
                r = c
                break
    if r is None:
        return None
    return tuple(float(r.get(k)) for k in ('Xmin', 'Ymin', 'Xmax', 'Ymax'))


def xform(b, m: Matrix):
    sx, r0, r1, sy, tx, ty = m
    pts = [(b[0], b[1]), (b[2], b[1]), (b[0], b[3]), (b[2], b[3])]
    out = [(sx * x + r1 * y + tx, r0 * x + sy * y + ty) for x, y in pts]
    xs = [p[0] for p in out]
    ys = [p[1] for p in out]
    return (min(xs), min(ys), max(xs), max(ys))


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def mat_dict(m: Matrix) -> dict:
    sx, r0, r1, sy, tx, ty = m
    return {
        'tx': tx / 20.0, 'ty': ty / 20.0,
        'scaleX': sx, 'scaleY': sy,
        'rotSkew0': r0, 'rotSkew1': r1,
    }


# ---------------------------------------------------------------------------
# origin-fraction bounds walk -- VERBATIM algorithm from worldmap-deco-origins.py
# ---------------------------------------------------------------------------

def recursive_bounds(idx: SwfIndex, cid: int, depth: int = 0):
    if depth > 12:
        return None
    if cid in idx.shapes:
        return rect(idx.shapes[cid], 'shapeBounds')
    if cid in idx.texts:
        return rect(idx.texts[cid], 'textBounds')
    if cid in idx.buttons:
        b = None
        for rec in idx.buttons[cid].iter():
            if rec.get('type') == 'BUTTONRECORD' and rec.get('buttonStateUp') == 'true':
                c = rec.get('characterId')
                if c is None:
                    continue
                cb = recursive_bounds(idx, int(c), depth + 1)
                if cb is not None:
                    b = union(b, xform(cb, matrix_of(rec)))
        return b
    if cid in idx.sprites:
        b = None
        for sub in idx.sprites[cid].iter():
            st = sub.get('type') or ''
            if st.startswith('PlaceObject'):
                c = sub.get('characterId')
                if c is None:
                    continue
                cb = recursive_bounds(idx, int(c), depth + 1)
                if cb is not None:
                    b = union(b, xform(cb, matrix_of(sub)))
        return b
    if cid in idx.bitmaps:
        el = idx.bitmaps[cid]
        w = float(el.get('bitmapWidth', 0))
        h = float(el.get('bitmapHeight', 0))
        if w and h:
            return (0.0, 0.0, w * 20.0, h * 20.0)
        return None
    return None


def origin_fraction(idx: SwfIndex, cid: int):
    """Returns (originFrac, boundsPx) for a symbol's own local coordinate space."""
    b = recursive_bounds(idx, cid)
    if b is None:
        return {'x': 0.0, 'y': 0.0}, None
    xmin, ymin, xmax, ymax = (v / 20.0 for v in b)
    w, h = xmax - xmin, ymax - ymin
    ox = -xmin / w if w else 0.0
    oy = -ymin / h if h else 0.0
    bounds_px = {'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax, 'w': w, 'h': h}
    return {'x': ox, 'y': oy}, bounds_px


# ---------------------------------------------------------------------------
# timeline walk: per-frame display list (depth -> character), used to build
# the STRUCTURAL node tree (as opposed to the flattened union bounds above).
# ---------------------------------------------------------------------------

def build_display_frames(sprite_el: ET.Element):
    """Depth-tracked display-list walk producing one child-list snapshot per
    ShowFrame tag: [[{depth,characterId,matrix,name}, ...], ...]."""
    frames = []
    display: dict[int, dict] = {}
    tags_el = sprite_el.find('subTags')
    iterable = tags_el if tags_el is not None else sprite_el
    for sub in iterable:
        t = sub.get('type') or ''
        if t in ('PlaceObject2Tag', 'PlaceObject3Tag'):
            depth = int(sub.get('depth'))
            entry = dict(display.get(depth, {}))
            if sub.get('placeFlagHasCharacter') == 'true':
                cid = sub.get('characterId')
                entry['characterId'] = int(cid) if cid is not None else None
            if sub.get('placeFlagHasMatrix') == 'true':
                entry['matrix'] = matrix_of(sub)
            if sub.get('placeFlagHasName') == 'true':
                name_el = sub.find('placeObjectName')
                entry['name'] = name_el.get('value') if name_el is not None else None
            entry.setdefault('matrix', (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
            entry['depth'] = depth
            display[depth] = entry
        elif t in ('RemoveObjectTag', 'RemoveObject2Tag'):
            depth = int(sub.get('depth'))
            display.pop(depth, None)
        elif t == 'ShowFrameTag':
            frames.append([display[d] for d in sorted(display.keys()) if display[d].get('characterId') is not None])
    if not frames:
        frames.append([display[d] for d in sorted(display.keys()) if display[d].get('characterId') is not None])
    return frames


# ---------------------------------------------------------------------------
# exported-PNG lookup (FFDec's own naming conventions, per format)
# ---------------------------------------------------------------------------

def find_exported_png(images_dir: str, cid: int, src_kind: str) -> Optional[str]:
    patterns = [
        os.path.join(images_dir, f'{cid}.png'),                       # shape:png
        os.path.join(images_dir, f'{cid}_*.png'),                     # image:png (bitmap)
        os.path.join(images_dir, f'DefineSprite_{cid}_*', '1.png'),   # sprite:png frame 1
        os.path.join(images_dir, f'DefineButton2_{cid}', '1_up.png'), # button:png up state
        os.path.join(images_dir, '**', f'{cid}.png'),
        os.path.join(images_dir, '**', f'{cid}_*.png'),
    ]
    for pat in patterns:
        hits = glob.glob(pat, recursive=True)
        if hits:
            return hits[0]
    return None


# ---------------------------------------------------------------------------
# node compiler
# ---------------------------------------------------------------------------

def leaf_image_node(idx: SwfIndex, cid: int, src_kind: str, images_dir, warnings, tolerance=4.0) -> dict:
    if src_kind == 'bitmap':
        el = idx.bitmaps[cid]
        w = float(el.get('bitmapWidth', 0))
        h = float(el.get('bitmapHeight', 0))
        bounds_twips = (0.0, 0.0, w * 20.0, h * 20.0)
    else:
        bounds_twips = rect(idx.shapes[cid], 'shapeBounds')
    if bounds_twips is None:
        warnings.append(f'{src_kind} {cid}: no bounds found (vector shape with no fill geometry?)')
        bounds_twips = (0.0, 0.0, 0.0, 0.0)
    xmin, ymin, xmax, ymax = (v / 20.0 for v in bounds_twips)
    w, h = xmax - xmin, ymax - ymin
    node = {
        'type': 'image',
        'characterId': cid,
        'symbolKind': src_kind,
        'boundsPx': {'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax, 'w': w, 'h': h},
        'textureKey': f'{cid}',
    }
    if images_dir:
        png = find_exported_png(images_dir, cid, src_kind)
        if png is None:
            warnings.append(f'{src_kind} {cid}: no exported PNG found under {images_dir} '
                             f'(run -export image,sprite,shape,button first) -- SKIPPED, no raster invented')
            node['textureMissing'] = True
        else:
            node['textureFile'] = os.path.relpath(png, images_dir)
            try:
                from PIL import Image
                with Image.open(png) as im:
                    iw, ih = im.size
                node['exportedPngSize'] = {'w': iw, 'h': ih}
                if abs(iw - w) > tolerance or abs(ih - h) > tolerance:
                    warnings.append(
                        f'{src_kind} {cid}: bounds {w:.1f}x{h:.1f} vs exported PNG {iw}x{ih} '
                        f'exceeds {tolerance}px self-check tolerance'
                    )
            except Exception as e:  # pragma: no cover - defensive
                warnings.append(f'{src_kind} {cid}: PNG size self-check failed ({e})')
    return node


def flattened_sprite_node(idx: SwfIndex, cid: int, images_dir, warnings: list) -> dict:
    """Emits a multi-frame sprite as an opaque per-frame raster leaf instead
    of recursing into its display list. Use via --flatten-sprite for symbols
    whose children are vector shapes with no individually-exportable bitmap
    (gradient fills etc.) -- per the task brief's rule ("矢量 shape 无对应位图
    ：记录跳过，不要发明光栅化"), each frame's texture is only ever a REAL
    FFDec `-export sprite` render; a missing render is recorded as a warning
    with textureMissing, never synthesized."""
    el = idx.sprites[cid]
    frame_count = int(el.get('frameCount', 1))
    origin, bounds_px = origin_fraction(idx, cid)
    node = {
        'type': 'image', 'characterId': cid, 'symbolKind': 'sprite-flattened',
        'boundsPx': bounds_px, 'originFrac': origin, 'frameCount': frame_count,
        'frames': [],
    }
    sprite_dirs = glob.glob(os.path.join(images_dir, f'DefineSprite_{cid}_*')) if images_dir else []
    for i in range(1, frame_count + 1):
        frame = {'frame': i, 'textureKey': f'{cid}_{i}'}
        png = None
        for d in sprite_dirs:
            cand = os.path.join(d, f'{i}.png')
            if os.path.exists(cand):
                png = cand
                break
        if png is None:
            if images_dir:
                warnings.append(f'sprite(flattened) {cid} frame {i}: no exported PNG found under {images_dir} '
                                 f'(run -export sprite first) -- SKIPPED, no raster invented')
            frame['textureMissing'] = True
        else:
            frame['textureFile'] = os.path.relpath(png, images_dir)
            try:
                from PIL import Image
                with Image.open(png) as im:
                    iw, ih = im.size
                frame['exportedPngSize'] = {'w': iw, 'h': ih}
            except Exception as e:  # pragma: no cover - defensive
                warnings.append(f'sprite(flattened) {cid} frame {i}: PNG read failed ({e})')
        node['frames'].append(frame)
    return node


def compile_node(idx: SwfIndex, cid: int, images_dir, warnings, depth: int = 0,
                  visiting: frozenset = frozenset(), flatten: frozenset = frozenset()) -> dict:
    kind = idx.kind_of(cid)

    if depth > MAX_RECURSION_DEPTH:
        warnings.append(f'cid={cid}: max recursion depth {MAX_RECURSION_DEPTH} exceeded, truncated')
        return {'type': 'container', 'characterId': cid, 'children': [], 'truncated': True}
    if cid in visiting:
        warnings.append(f'cid={cid}: reference cycle detected, truncated')
        return {'type': 'container', 'characterId': cid, 'children': [], 'cycle': True}

    if kind == 'shape':
        return leaf_image_node(idx, cid, 'shape', images_dir, warnings)
    if kind == 'bitmap':
        return leaf_image_node(idx, cid, 'bitmap', images_dir, warnings)

    if kind in ('text', 'edittext'):
        el = idx.texts[cid]
        b = rect(el, 'textBounds')
        if b is None:
            xmin = ymin = xmax = ymax = 0.0
        else:
            xmin, ymin, xmax, ymax = (v / 20.0 for v in b)
        text_value = None
        color = None
        size = None
        if kind == 'edittext':
            iv = el.find('initialText')
            text_value = iv.get('value') if iv is not None else el.get('initialText')
            fh = el.get('fontHeight')
            if fh:
                size = float(fh) / 20.0
            col = el.find('textColor')
            if col is not None:
                color = '#{:02x}{:02x}{:02x}'.format(
                    int(float(col.get('red', 0))), int(float(col.get('green', 0))), int(float(col.get('blue', 0)))
                )
        return {
            'type': 'text',
            'characterId': cid,
            'boundsPx': {'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax, 'w': xmax - xmin, 'h': ymax - ymin},
            'text': text_value,
            'fontSize': size,
            'color': color,
        }

    if kind == 'button':
        visiting2 = visiting | {cid}
        el = idx.buttons[cid]
        state_children = {'up': [], 'over': [], 'down': []}
        for rec in el.iter():
            if rec.get('type') != 'BUTTONRECORD':
                continue
            c = rec.get('characterId')
            if c is None:
                continue
            child = compile_node(idx, int(c), images_dir, warnings, depth + 1, visiting2, flatten)
            child = dict(child)
            child['matrix'] = mat_dict(matrix_of(rec))
            child['depth'] = int(rec.get('placeDepth', 0) or 0)
            for state, flag in (('up', 'buttonStateUp'), ('over', 'buttonStateOver'), ('down', 'buttonStateDown')):
                if rec.get(flag) == 'true':
                    state_children[state].append(child)
        frames = []
        for i, state in enumerate(('up', 'over', 'down'), start=1):
            if state_children[state]:
                frames.append({'frame': i, 'frameLabel': state, 'children': state_children[state]})
        node = {'type': 'container', 'characterId': cid, 'symbolKind': 'button'}
        if len(frames) <= 1:
            node['children'] = frames[0]['children'] if frames else []
        else:
            node['frames'] = frames
        return node

    if kind == 'sprite':
        if cid in flatten:
            return flattened_sprite_node(idx, cid, images_dir, warnings)
        visiting2 = visiting | {cid}
        el = idx.sprites[cid]
        frame_count = int(el.get('frameCount', 1))
        raw_frames = build_display_frames(el)
        frames = []
        for i, snap in enumerate(raw_frames, start=1):
            children = []
            for entry in snap:
                c = entry.get('characterId')
                if c is None:
                    continue
                child = compile_node(idx, int(c), images_dir, warnings, depth + 1, visiting2, flatten)
                child = dict(child)
                child['matrix'] = mat_dict(entry.get('matrix', (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)))
                child['depth'] = entry.get('depth')
                child['instanceName'] = entry.get('name')
                children.append(child)
            frames.append({'frame': i, 'children': children})
        node = {'type': 'container', 'characterId': cid, 'symbolKind': 'sprite'}
        if len(frames) <= 1:
            node['children'] = frames[0]['children'] if frames else []
        else:
            node['frameCount'] = frame_count
            node['frames'] = frames
        return node

    warnings.append(f'cid={cid}: unresolved character (not shape/sprite/button/text/bitmap in this SWF)')
    return {'type': 'unknown', 'characterId': cid}


def compile_symbol(idx: SwfIndex, symbol, images_dir=None, flatten_sprites=()) -> dict:
    cid = idx.resolve(symbol)
    warnings: list[str] = []
    flatten = frozenset(idx.resolve(s) for s in flatten_sprites)
    root = compile_node(idx, cid, images_dir, warnings, flatten=flatten)
    origin, bounds_px = origin_fraction(idx, cid)
    if bounds_px is None:
        warnings.append(f'symbol {symbol} (cid={cid}): no bounds derivable via recursive walk, origin defaults to (0,0)')
    root['originFrac'] = origin
    root['boundsPx'] = bounds_px
    return {
        'symbol': str(symbol),
        'characterId': cid,
        'sourceSwf': os.path.basename(idx.path),
        'root': root,
        'warnings': warnings,
    }


def collect_textures(node: dict, out: list) -> None:
    """Walks a compiled node tree collecting (characterId, textureFile) pairs
    for every leaf image node that resolved to a real exported PNG."""
    if not isinstance(node, dict):
        return
    if node.get('type') == 'image' and node.get('textureFile'):
        out.append((node['characterId'], node['textureFile']))
    for child in node.get('children', []) or []:
        collect_textures(child, out)
    for frame in node.get('frames', []) or []:
        if frame.get('textureFile'):
            out.append((node.get('characterId'), frame['textureFile']))
        for child in frame.get('children', []) or []:
            collect_textures(child, out)
