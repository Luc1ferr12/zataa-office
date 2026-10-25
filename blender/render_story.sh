#!/bin/sh
# Render aset divisi Zataa Story (25 Okt 2026): sprite kantor + muka + setengah badan untuk 6 pegawai baru,
# lalu latar kantor (denah Lt.2 baru) klasik + semua tema. Jalankan dari root repo:  sh blender/render_story.sh
#   STEPS="chars faces bg themes" (default semua) · THEMES="vanilla anime" untuk sebagian tema
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
OUT="$PWD/docs/assets/office"
IDS="sdir,sresearch,sscript,svisual,svideo,spublish"
STEPS="${STEPS:-chars faces bg themes}"
mkdir -p blender/out
node blender/export_scene.mjs blender/out/scene.json
for s in $STEPS; do case $s in
  chars)
    TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_sprites.py -- blender/out/scene.json "$OUT/chars" "$IDS" 40
    rm -rf "$OUT/chars/_tmp" "$OUT"/chars/*.png
    echo "STEP OK chars" ;;
  faces)
    TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/story_faces" 128 "$IDS"
    PORTRAIT=bust TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/story_busts" 128 "$IDS"
    python blender/faces_webp.py "$PWD/blender/out/story_faces" faces 160
    python blender/faces_webp.py "$PWD/blender/out/story_busts" busts 220
    echo "STEP OK faces" ;;
  bg)   # latar "klasik" (gaya toy lama, sama seperti render_all.sh)
    for m in day night; do
      "$BL" --background --factory-startup --python blender/toy_office.py -- blender/out/scene.json "$PWD/blender/out/office_$m.png" "${SAMPLES:-64}" 4.0 "$m"
      python blender/tile_bg.py "blender/out/office_$m.png" "$m" "$OUT/bg"
    done
    echo "STEP OK bg" ;;
  themes)
    sh blender/render_themes.sh
    echo "STEP OK themes" ;;
esac; done
echo ALL STORY DONE
