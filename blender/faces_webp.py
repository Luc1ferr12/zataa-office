# PNG hasil blender/toy_portraits.py → docs/assets/office/<faces|busts>/<id>.webp (transparan).
#   python blender/faces_webp.py <dir_png> [faces|busts] [ukuran]   (muka: avatar chat, 160 px · busts: kartu Tim setengah badan, 220 px)
import sys, os
from PIL import Image

src = sys.argv[1]
kind = sys.argv[2] if len(sys.argv) > 2 else 'faces'
size = int(sys.argv[3]) if len(sys.argv) > 3 else 160
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'assets', 'office', kind)
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('_'): continue
    im = Image.open(os.path.join(src, f)).convert('RGBA').resize((size, size), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=88, method=6)
    print(f[:-4])
