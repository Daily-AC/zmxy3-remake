#!/usr/bin/env python3
"""
zmxy-prefab-compiler CLI.

Usage:
    python3 tools/prefab-compiler/cli.py \
        --xml game/tmp/prefab-dev/level1.xml \
        --images game/tmp/prefab-dev/level1-images \
        --symbol 107 --name files1 \
        --out game/tmp/prefab-dev/out \
        --copy-textures-to game/public/assets/extracted/prefab/files1

--symbol accepts a numeric characterId or a SymbolClassTag class name (e.g.
"export.shop.PassiveSkillControl"). Pass it multiple times to compile
several symbols from the same swf2xml in one run.

Exits non-zero (and prints every warning) if any self-check warning was
raised, unless --allow-warnings is passed -- "违者报错不静默" per the task
brief. Warnings are always written into the output JSON's `warnings` array
either way, so --allow-warnings still leaves a paper trail.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compiler import SwfIndex, compile_symbol, collect_textures  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='Compile FFDec swf2xml output into a Phaser prefab JSON.')
    ap.add_argument('--xml', required=True, help='FFDec -swf2xml output file')
    ap.add_argument('--images', default=None,
                     help='Directory FFDec -export image,sprite,shape,button wrote PNGs into (for the self-check + texture manifest)')
    ap.add_argument('--symbol', action='append', required=True,
                     help='Target symbol: numeric characterId or SymbolClassTag class name. Repeatable.')
    ap.add_argument('--name', action='append', default=None,
                     help='Output basename per --symbol (same order). Defaults to the symbol string, sanitized.')
    ap.add_argument('--out', required=True, help='Output directory for <name>.prefab.json')
    ap.add_argument('--copy-textures-to', default=None,
                     help='If set, copy every referenced PNG (deduped) into this directory')
    ap.add_argument('--flatten-sprite', action='append', default=[],
                     help='Symbol (numeric id or class name) to compile as an opaque per-frame raster leaf '
                          'instead of recursing into its display list -- for symbols whose children are '
                          'vector shapes with no individually-exportable bitmap. Repeatable.')
    ap.add_argument('--allow-warnings', action='store_true',
                     help='Do not fail the process on self-check warnings (they are still recorded in the JSON)')
    args = ap.parse_args(argv)

    names = args.name or []
    if names and len(names) != len(args.symbol):
        ap.error('--name must be passed once per --symbol if used at all')

    idx = SwfIndex(args.xml)
    os.makedirs(args.out, exist_ok=True)
    if args.copy_textures_to:
        os.makedirs(args.copy_textures_to, exist_ok=True)

    any_warnings = False
    for i, sym in enumerate(args.symbol):
        result = compile_symbol(idx, sym, images_dir=args.images, flatten_sprites=args.flatten_sprite)
        name = names[i] if names else _sanitize(sym)
        out_path = os.path.join(args.out, f'{name}.prefab.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f'{sym} (cid={result["characterId"]}) -> {out_path}  '
              f'origin=({result["root"]["originFrac"]["x"]:.3f},{result["root"]["originFrac"]["y"]:.3f})  '
              f'{len(result["warnings"])} warning(s)')
        for w in result['warnings']:
            print(f'  WARNING: {w}')
            any_warnings = True

        if args.copy_textures_to:
            textures: list = []
            collect_textures(result['root'], textures)
            seen = set()
            for cid, rel in textures:
                if (cid, rel) in seen:
                    continue
                seen.add((cid, rel))
                src = os.path.join(args.images, rel)
                dst_name = os.path.basename(rel) if ('/' not in rel and '\\' not in rel) \
                    else f'{cid}_{os.path.basename(rel)}'
                dst = os.path.join(args.copy_textures_to, dst_name)
                if os.path.abspath(src) != os.path.abspath(dst):
                    shutil.copyfile(src, dst)

    if any_warnings and not args.allow_warnings:
        print('\nprefab-compiler: self-check warnings present, failing (pass --allow-warnings to override).', file=sys.stderr)
        return 1
    return 0


def _sanitize(sym: str) -> str:
    return sym.replace('.', '_').replace(' ', '_')


if __name__ == '__main__':
    raise SystemExit(main())
