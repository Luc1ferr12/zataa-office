#!/bin/sh
# Render semua aset gaya 3D mainan untuk web (±2 jam di RTX 3050). Jalankan dari root repo.
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
OUT="$PWD/docs/assets/office"
node blender/export_scene.mjs blender/out/scene.json 1
node blender/export_scene.mjs blender/out/scene_down.json 0
"$BL" --background --factory-startup --python blender/toy_sprites.py -- blender/out/scene.json "$OUT/chars" "${IDS:-}" 40
for v in up down; do
  src=blender/out/scene.json; [ "$v" = down ] && src=blender/out/scene_down.json
  for m in day night; do
    "$BL" --background --factory-startup --python blender/toy_office.py -- "$src" "$OUT/${v}_${m}.webp" "${SAMPLES:-64}" 2.0 "$m"
  done
done
rm -rf "$OUT/chars/_tmp" "$OUT"/chars/*.png
echo ALL DONE
