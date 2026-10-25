#!/bin/sh
# Render latar semua tema kantor (blender/office_themes.py) → tile web docs/assets/office/bg/themes/<tema>/ + themes.json.
# Jalankan dari root repo:  sh blender/render_themes.sh            (semua tema)
#                           THEMES="anime disney" sh blender/render_themes.sh
# Latar "klasik" (docs/assets/office/bg/day|night) tetap dari render_all.sh.
set -e
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
OUT="$PWD/docs/assets/office/bg/themes"
THEMES="${THEMES:-vanilla anime cartoon medieval futuristic jungle disney}"
node blender/export_scene.mjs blender/out/scene.json
for t in $THEMES; do
  for m in day night; do
    OFFICE_THEME=$t TOY_STYLE=chibi "$BL" --background --factory-startup --python blender/toy_office.py -- \
      blender/out/scene.json "$PWD/blender/out/theme_${t}_$m.png" "${SAMPLES:-48}" 4.0 "$m"
    python blender/tile_bg.py "blender/out/theme_${t}_$m.png" "$m" "$OUT/$t"
  done
  echo "TEMA OK $t"
done
python - <<'EOF'
import json, os, sys
sys.path.insert(0, 'blender')
from office_themes import THEMES
out = 'docs/assets/office/bg/themes'
have = [t for t in THEMES if os.path.exists(os.path.join(out, t, 'manifest.json'))]
json.dump([{'id': 'klasik', 'label': 'Klasik'}] + [{'id': t, 'label': THEMES[t]['label']} for t in have],
          open(os.path.join(out, 'themes.json'), 'w'), ensure_ascii=False)
print('themes.json:', have)
EOF
echo ALL THEMES DONE
