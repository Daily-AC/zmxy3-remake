#!/usr/bin/env python3
"""Decrypt 造梦西游Online's byte-swapped SWF resource files.

Algorithm ported from jbji/ZaoMeng_JourneyToTheWest_3_4399_Flash_Utility
(MIT license, ZaoMengFlashCracker/main_UTF8.cpp): the first END bytes of the
file are rotated (block [PIVOT:END] moved to the front, followed by block
[0:PIVOT]); bytes from END onward are untouched. That repo documents
PIVOT=200/END=275 for the offline "再续天庭" client and PIVOT=96/END=165 for
an older one — neither matched Online's cache files. PIVOT=300/END=325 was
found here by brute force against a real cached SWF (searched every
(pivot, end) pair for one that both restores a valid FWS/CWS/ZWS
signature+version AND whose post-header bytes are a zlib stream that
decompresses cleanly to completion, not just a plausible first byte) and
confirmed unique + verified against real ZaoMeng Online CDN-delivered
resource files: the recovered SWF's declared body length matches the
zlib-decompressed length exactly, and FFDec opens it cleanly.
"""
import struct
import sys
from pathlib import Path

PIVOT = 300
END = 325


def decode(data: bytes) -> bytes:
    window = data[:END]
    rotated = window[PIVOT:END] + window[0:PIVOT]
    return rotated + data[END:]


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: decrypt-zmxyol-swf.py <in.swf> <out.swf> [...]", file=sys.stderr)
        sys.exit(1)
    for i in range(1, len(sys.argv), 2):
        src, dst = Path(sys.argv[i]), Path(sys.argv[i + 1])
        data = src.read_bytes()
        out = decode(data)
        sig = out[0:3]
        if sig not in (b"FWS", b"CWS", b"ZWS"):
            print(f"WARNING: {src} did not decode to a valid SWF signature (got {sig!r})", file=sys.stderr)
        else:
            flen = struct.unpack("<I", out[4:8])[0]
            print(f"{src} -> {dst}: {sig.decode()} v{out[3]}, declared size {flen}, on-disk {len(out)}")
        dst.write_bytes(out)


if __name__ == "__main__":
    main()
