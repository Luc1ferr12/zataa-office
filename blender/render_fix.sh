#!/bin/sh
# render ulang karakter tertentu: lembar + muka + setengah badan, lalu gabung ulang semua lembar divisi
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
IDS="${IDS:?isi IDS}"
D="$PWD/blender/out/sheet"
for c in $IDS; do
  TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_sheet.py -- "$D" 160 "$c" 1.0 2>&1 | grep -E "Error|Traceback" | grep -v HIP || true
  echo "KARAKTER OK $c"
done
L=$(echo $IDS | tr ' ' ',')
TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/faces_chibi" 128 "$L" 2>&1 | grep -E "Error|Traceback" | grep -v HIP || true
PORTRAIT=bust TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/busts_chibi" 128 "$L" 2>&1 | grep -E "Error|Traceback" | grep -v HIP || true
python blender/faces_webp.py "$PWD/blender/out/faces_chibi"
python blender/sheet_compose.py "$D" blender/out/cast_boss.png owner sec ob
python blender/sheet_compose.py "$D" blender/out/cast_marketing1.png dir researcher price copywriter
python blender/sheet_compose.py "$D" blender/out/cast_marketing2.png designer publisher video ads analyst
python blender/sheet_compose.py "$D" blender/out/cast_youtube1.png ydir yresearch yscript
python blender/sheet_compose.py "$D" blender/out/cast_youtube2.png yvisual yvideo ypublish
python blender/sheet_compose.py "$D" blender/out/cast_trading1.png tdir tresearch ttech trisk
python blender/sheet_compose.py "$D" blender/out/cast_trading2.png texec teval treport
python blender/sheet_compose.py "$D" blender/out/cast_story1.png sdir sresearch sscript
python blender/sheet_compose.py "$D" blender/out/cast_story2.png svisual svideo spublish
echo ALL FIX DONE
