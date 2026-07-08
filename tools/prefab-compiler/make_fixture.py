#!/usr/bin/env python3
"""
One-off helper (not part of the compiler's runtime path) used to build the
small self-contained XML fixtures under tests/fixtures/ from a full
swf2xml dump: closure-walks every characterId a set of root symbols
transitively reference and writes just those tags into a minimal
<swf><tags>...</tags></swf> document, so the regression tests don't depend
on vendor/ or tmp/ extraction artifacts being present on disk.

Re-run only if the truth-table symbols change:
    python3 tools/prefab-compiler/make_fixture.py \
        tmp/worldmap-extract/OtherMat1.xml \
        tools/prefab-compiler/tests/fixtures/worldmap_nodes.xml \
        857 871 973 931
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET


def build_index(xml_path: str):
    by_id = {}  # (kind, id) -> element ; kind in {shape, sprite, button, text}
    symbol_class_el = None
    for _, el in ET.iterparse(xml_path):
        t = el.get('type')
        if t == 'DefineSpriteTag':
            by_id[('sprite', int(el.get('spriteId')))] = el
        elif t == 'DefineButton2Tag':
            by_id[('button', int(el.get('buttonId')))] = el
        elif t and t.startswith('DefineShape'):
            cid = el.get('shapeId')
            if cid is not None:
                by_id[('shape', int(cid))] = el
        elif t in ('DefineTextTag', 'DefineText2Tag', 'DefineEditTextTag'):
            cid = el.get('characterId') or el.get('characterID')
            if cid is not None:
                by_id[('text', int(cid))] = el
        elif t and t.startswith('DefineBits'):
            cid = el.get('characterId') or el.get('characterID')
            if cid is not None:
                by_id[('bitmap', int(cid))] = el
        elif t == 'SymbolClassTag':
            symbol_class_el = el
    return by_id, symbol_class_el


def referenced_ids(el: ET.Element) -> set[int]:
    out = set()
    for sub in el.iter():
        st = sub.get('type') or ''
        if st.startswith('PlaceObject') or st == 'BUTTONRECORD':
            c = sub.get('characterId')
            if c is not None:
                out.add(int(c))
    return out


def closure(by_id: dict, roots: list[int]) -> set:
    seen_ids: set[int] = set()
    stack = list(roots)
    kinds_used = set()
    while stack:
        cid = stack.pop()
        if cid in seen_ids:
            continue
        seen_ids.add(cid)
        for kind in ('sprite', 'button', 'shape', 'text', 'bitmap'):
            key = (kind, cid)
            if key in by_id:
                kinds_used.add(key)
                for ref in referenced_ids(by_id[key]):
                    if ref not in seen_ids:
                        stack.append(ref)
    return kinds_used


def main(argv):
    src, dst, *root_strs = argv
    roots = [int(x) for x in root_strs]
    by_id, symbol_class_el = build_index(src)
    keys = closure(by_id, roots)

    root = ET.Element('swf')
    tags = ET.SubElement(root, 'tags')
    for key in sorted(keys, key=lambda k: (k[0], k[1])):
        tags.append(by_id[key])
    if symbol_class_el is not None:
        # keep only entries for ids we actually included, so name-based
        # resolution still works for the fixture's own symbols.
        pruned = ET.Element('item', symbol_class_el.attrib)
        tags_list = ET.SubElement(pruned, 'tags')
        names_list = ET.SubElement(pruned, 'names')
        tags_el = symbol_class_el.find('tags')
        names_el = symbol_class_el.find('names')
        included_ids = {k[1] for k in keys}
        for t_el, n_el in zip(tags_el, names_el):
            if t_el.text and int(t_el.text) in included_ids:
                ET.SubElement(tags_list, 'item').text = t_el.text
                ET.SubElement(names_list, 'item').text = n_el.text
        tags.append(pruned)

    ET.ElementTree(root).write(dst, encoding='unicode' if False else 'UTF-8', xml_declaration=True)
    print(f'wrote {dst}: {len(keys)} tags for roots {roots}')


if __name__ == '__main__':
    main(sys.argv[1:])
