#!/usr/bin/env python3
"""Derive local-origin fractions + placement for SelectRole (S2) symbols.

Same recursive-bounds method as worldmap-deco-origins.py (see docs/playbooks/
ui-port-dual-source.md "S1 棒沉淀的三条补充纪律" #1), retargeted at
OtherMat1's export.SelectRole (chid 1012) panel buttons.

Usage: python3 tools/selectrole-origins.py <path-to-swf2xml-of-OtherMat1>
"""
import xml.etree.ElementTree as ET
import sys, os

XML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(__file__), "..", "game", "tmp", "s2s3-extract", "OtherMat1-full.xml"
)

# panel button-child character ids (the "up" state child of each SimpleButton,
# reused unfiltered for over/down -- see selectrole-saveslots-report.md).
TARGETS = {
    983: "panel1_wukong",
    989: "panel2_tangseng",
    994: "panel3_bajie",
    1000: "panel4_shasheng",
    1011: "panel5_mystery",  # static, always-filtered (no button)
    11: "badge_1p",
    14: "badge_2p",
}

buttons, sprites, shapes, texts = {}, {}, {}, {}

for _, el in ET.iterparse(XML):
    t = el.get('type')
    if t == 'DefineButton2Tag':
        buttons[int(el.get('buttonId'))] = el
    elif t == 'DefineSpriteTag':
        sprites[int(el.get('spriteId'))] = el
    elif t and t.startswith('DefineShape'):
        cid = el.get('shapeId')
        if cid is not None:
            shapes[int(cid)] = el
    elif t in ('DefineTextTag', 'DefineText2Tag', 'DefineEditTextTag'):
        cid = el.get('characterId') or el.get('characterID')
        if cid is not None:
            texts[int(cid)] = el


def rect(el, tag):
    r = el.find(tag)
    if r is None:
        for c in el.iter():
            if c.tag == tag or (c.get('type') == 'RECT' and c.tag == tag):
                r = c
                break
    if r is None:
        return None
    return tuple(float(r.get(k)) for k in ('Xmin', 'Ymin', 'Xmax', 'Ymax'))


def matrix_of(el):
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


def xform(b, m):
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


def bounds(cid, depth=0):
    if depth > 14:
        return None
    if cid in shapes:
        return rect(shapes[cid], 'shapeBounds')
    if cid in texts:
        return rect(texts[cid], 'textBounds')
    if cid in buttons:
        b = None
        for rec in buttons[cid].iter():
            if rec.get('type') == 'BUTTONRECORD' and rec.get('buttonStateUp') == 'true':
                cb = bounds(int(rec.get('characterId')), depth + 1)
                if cb is not None:
                    b = union(b, xform(cb, matrix_of(rec)))
        return b
    if cid in sprites:
        b = None
        for sub in sprites[cid].iter():
            st = sub.get('type') or ''
            if st.startswith('PlaceObject'):
                c = sub.get('characterId')
                if c is None:
                    continue
                cb = bounds(int(c), depth + 1)
                if cb is not None:
                    b = union(b, xform(cb, matrix_of(sub)))
        return b
    return None


for cid, name in sorted(TARGETS.items(), key=lambda kv: kv[1]):
    b = bounds(cid)
    if b is None:
        print(f'{name}\tid={cid}\tNO BOUNDS')
        continue
    xmin, ymin, xmax, ymax = (v / 20.0 for v in b)
    w, h = xmax - xmin, ymax - ymin
    ox = -xmin / w if w else 0.0
    oy = -ymin / h if h else 0.0
    print(f'{name}\tid={cid}\tbounds_px=({xmin:.2f},{ymin:.2f})..({xmax:.2f},{ymax:.2f})\tsize=({w:.1f}x{h:.1f})\torigin=({ox:.3f},{oy:.3f})')
