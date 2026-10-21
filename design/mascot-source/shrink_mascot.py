"""Shrinks Brokely's mascot PNGs to WebP for the app (NFR-19: app under 5 MB).

Usage:  python shrink_mascot.py <folder with PNGs> <output folder> [longest side px] [quality]
Keeps transparency; never touches the source PNGs.
"""
import os
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
side = int(sys.argv[3]) if len(sys.argv) > 3 else 768
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 85
os.makedirs(out, exist_ok=True)

before = after = 0
for name in sorted(os.listdir(src)):
    if not name.lower().endswith(".png"):
        continue
    path = os.path.join(src, name)
    img = Image.open(path).convert("RGBA")
    img.thumbnail((side, side), Image.LANCZOS)  # keeps the proportions
    target = os.path.join(out, os.path.splitext(name)[0] + ".webp")
    img.save(target, "WEBP", quality=quality, method=6)
    b, a = os.path.getsize(path), os.path.getsize(target)
    before, after = before + b, after + a
    print(f"{name:28} {b / 1024:6.0f} KB -> {a / 1024:5.0f} KB  {img.size[0]}x{img.size[1]}")
print(f"total {before / 1024 / 1024:.1f} MB -> {after / 1024 / 1024:.2f} MB")
