#!/usr/bin/env python3
"""Derive local-origin fractions for the 6 SelectPLace landmark decorations.

For each deco instance (llbt/btnnmg/kls/sgzz/dsgbtn/sssl) we know its library
characterId. A symbol's PlaceObject Matrix maps its LOCAL (0,0); the exported
PNG covers the artwork bounds. If artwork bounds min != (0,0) the Phaser image
must use origin fraction (-xmin/w, -ymin/h) instead of (0,0) — same fix the
node markers already got (see WorldMapScene NODE_ORIGIN).

Bounds come from OtherMat1's swf2xml: recurse button->sprite->shape unioning
matrix-transformed child bounds (twips; /20 = px).
"""
import xml.etree.ElementTree as ET
import sys, os

XML = os.path.join(os.path.dirname(__file__), "..", "tmp", "worldmap-extract", "OtherMat1.xml")
DECOS = {973: 'llbt', 931: 'btnnmg', 924: 'kls', 889: 'sgzz', 847: 'dsgbtn', 840: 'sssl'}

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
                r = c; break
    if r is None:
        return None
    return tuple(float(r.get(k)) for k in ('Xmin', 'Ymin', 'Xmax', 'Ymax'))

def matrix_of(el):
    for c in el:
        if c.get('type') == 'MATRIX':
            tx = float(c.get('translateX', 0)); ty = float(c.get('translateY', 0))
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
    xs = [p[0] for p in out]; ys = [p[1] for p in out]
    return (min(xs), min(ys), max(xs), max(ys))

def union(a, b):
    if a is None: return b
    if b is None: return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))

def bounds(cid, depth=0):
    if depth > 12:
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

for cid, name in sorted(DECOS.items(), key=lambda kv: kv[1]):
    b = bounds(cid)
    if b is None:
        print(f'{name}\tid={cid}\tNO BOUNDS')
        continue
    xmin, ymin, xmax, ymax = (v / 20.0 for v in b)
    w, h = xmax - xmin, ymax - ymin
    ox = -xmin / w if w else 0.0
    oy = -ymin / h if h else 0.0
    print(f'{name}\tid={cid}\tbounds_px=({xmin:.2f},{ymin:.2f})..({xmax:.2f},{ymax:.2f})\tsize=({w:.1f}x{h:.1f})\torigin=({ox:.3f},{oy:.3f})')
