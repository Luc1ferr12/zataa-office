# Potong render latar kantor (ukuran tampilan penuh, DS× resolusi mesin) jadi tile 512 px untuk beberapa tingkat detail.
#   python blender/tile_bg.py <render.png> <day|night> <docs/assets/office/bg>
# hasil: <out>/<mode>/<f>/<col>_<row>.webp  (f = 1, 2, 4, 8 → 1/f resolusi) + <out>/manifest.json
import sys, os, json
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC, MODE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
TILE, LEVELS = 512, [1, 2, 4, 8]
im = Image.open(SRC).convert('RGB')
W, H = im.size
for f in LEVELS:
    lv = im if f == 1 else im.resize((max(1, round(W / f)), max(1, round(H / f))), Image.LANCZOS)
    d = os.path.join(OUT, MODE, str(f)); os.makedirs(d, exist_ok=True)
    cols, rows = -(-lv.width // TILE), -(-lv.height // TILE)
    for c in range(cols):
        for r in range(rows):
            box = (c * TILE, r * TILE, min(lv.width, (c + 1) * TILE), min(lv.height, (r + 1) * TILE))
            lv.crop(box).save(os.path.join(d, f'{c}_{r}.webp'), 'WEBP', quality=84 if f == 1 else 88, method=5)
    print(MODE, 'level', f, cols, 'x', rows, flush=True)
json.dump({'w': W, 'h': H, 'tile': TILE, 'levels': LEVELS}, open(os.path.join(OUT, 'manifest.json'), 'w'))
print('TILES OK', MODE, W, H)
