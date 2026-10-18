# PNG hasil blender/toy_portraits.py → docs/assets/office/faces/<id>.webp (160×160, transparan) buat avatar card Tim.
#   python blender/faces_webp.py <dir_png>
import sys, os
from PIL import Image

src = sys.argv[1]
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'assets', 'office', 'faces')
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('_'): continue
    im = Image.open(os.path.join(src, f)).convert('RGBA').resize((160, 160), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=88, method=6)
    print(f[:-4])
