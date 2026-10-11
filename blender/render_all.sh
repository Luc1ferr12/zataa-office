#!/bin/sh
# Render semua aset gaya 3D mainan untuk web (kantor terasering v2). Jalankan dari root repo.
#   IDS=tdir,ttech sh blender/render_all.sh   → sprite pegawai tertentu saja; SKIP_CHARS=1 → latar saja
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
OUT="$PWD/docs/assets/office"
node blender/export_scene.mjs blender/out/scene.json
if [ -z "$SKIP_CHARS" ]; then
  "$BL" --background --factory-startup --python blender/toy_sprites.py -- blender/out/scene.json "$OUT/chars" "${IDS:-}" 40
  rm -rf "$OUT/chars/_tmp" "$OUT"/chars/*.png
fi
# latar: render ukuran tampilan penuh (DS=4 × resolusi mesin), lalu dipotong jadi tile LOD
for m in day night; do
  "$BL" --background --factory-startup --python blender/toy_office.py -- blender/out/scene.json "$PWD/blender/out/office_$m.png" "${SAMPLES:-64}" 4.0 "$m"
  python blender/tile_bg.py "blender/out/office_$m.png" "$m" "$OUT/bg"
done
echo ALL DONE
