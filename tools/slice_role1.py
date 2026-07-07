#!/usr/bin/env python3
"""Slice ROLE1_<clothId> spritesheet (1200x2800, 6x14 cells of 200x200) into
per-action PNG frame sequences, following export.hero.Role1.setAction() +
initBBDC() from 打开我开始玩.swf.

Usage: python slice_role1.py <sheet.png> <outdir>
"""
import sys
from PIL import Image

CELL = 200  # BaseBitmapDataClip(..., 200, 200, ...)

# action -> (start_col, row, frame_count)
# rows/cols from Role1.setAction(); frame counts = len of each
# setFrameStopCount row: [[2,2,2,3,2,4],[5,5],[4,4,4,4],[2,2,2,2],
#  [1,1,13,100,hit11,hit11],[2,2,2,2,2],[2,2,1,1,3],[1,1,1,1,5],[1,1,1,1,5],
#  [2,2,1,1,5],[2,2,1,6],[2,3,2,3],[17,15,15,10],[2,12,16]]
ACTIONS = {
    "wait":    (0, 0, 6),
    "wait2":   (0, 1, 2),
    "walk":    (0, 2, 4),
    "run":     (0, 3, 4),
    "jump1":   (0, 4, 1),
    "jump3":   (1, 4, 1),
    "hit9":    (2, 4, 1),
    "hit10":   (3, 4, 1),
    "hit11_1": (4, 4, 1),
    "hit11_2": (5, 4, 1),
    "jump2":   (0, 5, 5),
    "hit1":    (0, 6, 5),   # hit2 shares row 6
    "hit3":    (0, 7, 5),
    "hit4":    (0, 8, 5),
    "hit5":    (0, 9, 5),
    "hit6":    (0, 10, 4),
    "hit8":    (0, 11, 4),
    "hit12":   (0, 12, 1),
    "hit7":    (1, 12, 1),
    "hurt":    (2, 12, 1),
    "hit13":   (3, 12, 1),
    "hit14":   (0, 13, 3),
}

def main(sheet_path, outdir):
    import os
    os.makedirs(outdir, exist_ok=True)
    sheet = Image.open(sheet_path).convert("RGBA")
    assert sheet.size == (1200, 2800), f"unexpected sheet size {sheet.size}"
    n = 0
    for action, (col0, row, count) in ACTIONS.items():
        for i in range(count):
            x, y = (col0 + i) * CELL, row * CELL
            frame = sheet.crop((x, y, x + CELL, y + CELL))
            frame.save(os.path.join(outdir, f"{action}_{i:02d}.png"))
            n += 1
    print(f"wrote {n} frames to {outdir}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
