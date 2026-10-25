#!/bin/sh
# Render lembar karakter (turnaround + muka) gaya chibi untuk pegawai, lalu digabung per divisi.
#   sh blender/render_cast.sh                 (semua)
#   IDS="dir researcher" sh blender/render_cast.sh
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
D="$PWD/blender/out/sheet"
IDS="${IDS:-ob dir researcher price copywriter designer publisher video ads analyst ydir yresearch yscript yvisual yvideo ypublish tdir tresearch ttech trisk texec teval treport owner sec}"
for c in $IDS; do
  TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_sheet.py -- "$D" "${SAMPLES:-160}" "$c" 1.0 2>&1 | grep -E "Error|Traceback" | grep -v HIP || true
  echo "KARAKTER OK $c"
done
python blender/sheet_compose.py "$D" blender/out/cast_boss.png owner sec ob
python blender/sheet_compose.py "$D" blender/out/cast_marketing1.png dir researcher price copywriter
python blender/sheet_compose.py "$D" blender/out/cast_marketing2.png designer publisher video ads analyst
python blender/sheet_compose.py "$D" blender/out/cast_youtube1.png ydir yresearch yscript
python blender/sheet_compose.py "$D" blender/out/cast_youtube2.png yvisual yvideo ypublish
python blender/sheet_compose.py "$D" blender/out/cast_trading1.png tdir tresearch ttech trisk
python blender/sheet_compose.py "$D" blender/out/cast_trading2.png texec teval treport
# foto profil chibi (avatar Chit-chat & card Tim)
TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/faces_chibi" 128 2>&1 | grep -E "Error|Traceback|PORTRAIT" | grep -v HIP || true
python blender/faces_webp.py "$PWD/blender/out/faces_chibi"
# setengah badan buat kartu Tim (catatan Owner 26 Okt) → blender/out/busts_chibi/<id>.png (dipasang ke web setelah dicek)
PORTRAIT=bust TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_portraits.py -- "$PWD/blender/out/busts_chibi" 128 2>&1 | grep -E "Error|Traceback" | grep -v HIP || true
echo ALL CAST DONE
