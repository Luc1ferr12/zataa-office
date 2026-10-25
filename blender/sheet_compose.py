# Gabung render toy_sheet.py jadi lembar karakter (gaya character sheet): judul + info, 4 sisi berlabel, panel close-up muka.
#   python blender/sheet_compose.py <dir_render> <out.png> <id> [<id> ...]
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

INFO = {   # judul, peran, gaya, warna
    'owner': ('MALE', 'Owner / Boss', 'Modern Casual', 'Black - Purple'),
    'sec': ('FEMALE', 'Sekretaris (Aprista)', 'Modern Casual', 'Black - Purple - White'),
    'ob': ('FEMALE', 'Office Girl (Mbak Sari)', 'Office Casual', 'White - Black - Purple'),
    'dir': ('MALE', 'Marketing Director (Andre)', 'Modern Casual', 'Black - Purple'),
    'researcher': ('FEMALE', 'Researcher (Clariana)', 'Modern Casual', 'Black - Purple'),
    'price': ('MALE', 'Price Watcher (Budi)', 'Modern Casual', 'Black - Purple'),
    'copywriter': ('FEMALE', 'Copywriter (Ista)', 'Modern Casual', 'Black - Purple - White'),
    'designer': ('FEMALE', 'Graphic Designer (Maria)', 'Street Casual', 'Purple - Black'),
    'publisher': ('MALE', 'Social Publisher (Fikri)', 'Street Casual', 'Black - Purple'),
    'video': ('MALE', 'Video Producer (Dimas)', 'Modern Casual', 'Black - Purple'),
    'ads': ('FEMALE', 'Ads Specialist (Fahriah)', 'Modern Hijab', 'Purple - Black'),
    'analyst': ('MALE', 'Data Analyst (Raka)', 'Modern Casual', 'Black - Purple'),
    'ydir': ('MALE', 'YouTube Director (Bagas)', 'Modern Casual', 'Black - Purple'),
    'yresearch': ('FEMALE', 'Riset Sejarah (Nadhira)', 'Modern Hijab', 'Navy - Black - White'),
    'yscript': ('FEMALE', 'Scriptwriter (Laras)', 'Modern Casual', 'Purple - Black'),
    'yvisual': ('MALE', 'Visual & Creative (Galih)', 'Modern Casual', 'Black - Purple'),
    'yvideo': ('MALE', 'Video Producer (Yoga)', 'Street Casual', 'Black - Purple'),
    'ypublish': ('FEMALE', 'Publisher (Kirana)', 'Modern Casual', 'Purple - Black - White'),
    'tdir': ('MALE', 'Trading Director (Mahendra)', 'Smart Formal', 'Black - Purple'),
    'tresearch': ('FEMALE', 'Research & Fundamental (Davina)', 'Smart Casual', 'Navy - White'),
    'ttech': ('FEMALE', 'Technical Analyst (Keira)', 'Modern Casual', 'Black - Purple - White'),
    'trisk': ('MALE', 'Decision & Risk (Aryaputra)', 'Street Casual', 'Black - Purple'),
    'texec': ('MALE', 'Execution (Wiratama)', 'Modern Casual', 'Deep Purple - Black'),
    'teval': ('FEMALE', 'Evaluation (Jihan)', 'Modern Casual', 'Purple - Black - White'),
    'treport': ('FEMALE', 'Reporting (Selena)', 'Modern Casual', 'Black - Purple'),
}
SRC, OUT, IDS = sys.argv[1], sys.argv[2], sys.argv[3:]
BG, LINE, ACC, TXT, SUB = (22, 18, 30), (74, 58, 120), (139, 92, 246), (236, 232, 245), (176, 168, 196)

def font(sz, bold=False):
    for f in (('segoeuib.ttf' if bold else 'segoeui.ttf'), ('arialbd.ttf' if bold else 'arial.ttf')):
        try: return ImageFont.truetype(os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', f), sz)
        except OSError: pass
    return ImageFont.load_default()

ROW_H, W = 1060, 3000
im = Image.new('RGB', (W, ROW_H * len(IDS)), BG)
glow = Image.new('L', im.size, 0); gd = ImageDraw.Draw(glow)
for r in range(len(IDS)): gd.ellipse((900, r * ROW_H + 250, 1900, r * ROW_H + 1000), fill=38)
im = Image.composite(Image.new('RGB', im.size, (60, 40, 100)), im, glow.filter(ImageFilter.GaussianBlur(220)))
d = ImageDraw.Draw(im)

def load(cid, v):
    p = os.path.join(SRC, f'{cid}_{v}.png')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None

def fit(img, h):
    return img.resize((int(img.width * h / img.height), h), Image.LANCZOS)

for r, cid in enumerate(IDS):
    y0 = r * ROW_H
    title, role, style, color = INFO.get(cid, (cid.upper(), cid, 'Modern Casual', 'Black - Purple'))
    d.polygon([(60, y0 + 70), (82, y0 + 70), (70, y0 + 108), (48, y0 + 108)], fill=ACC)
    d.text((100, y0 + 62), title, font=font(44, True), fill=TXT)
    d.line((60, y0 + 125, 330, y0 + 125), fill=LINE, width=2)
    for i, (k, v) in enumerate((('Role', role), ('Style', style), ('Color', color))):
        d.text((60, y0 + 150 + i * 40), k, font=font(22), fill=ACC)
        f_ = font(22)
        while d.textlength(': ' + v, font=f_) > 260 and f_.size > 14: f_ = font(f_.size - 1)   # teks panjang dikecilin, jangan kepotong
        d.text((140, y0 + 150 + i * 40), ': ' + v, font=f_, fill=SUB)
    x = 410
    for v, lab in (('front', 'Front'), ('back', 'Back'), ('left', 'Left'), ('right', 'Right')):
        img = load(cid, v)
        if img is None: continue
        img = fit(img, 900)
        im.paste(img, (x, y0 + 40), img)
        tw = d.textlength(lab, font=font(32, True))
        d.text((x + img.width / 2 - tw / 2, y0 + 960), lab, font=font(32, True), fill=(196, 170, 255))
        x += img.width - 40
    # panel muka
    px, pw = W - 720, 660
    d.rounded_rectangle((px, y0 + 40, px + pw, y0 + 1010), 18, outline=LINE, width=2)
    d.text((px + 22, y0 + 52), 'Full Face', font=font(30, True), fill=TXT)
    big = load(cid, 'face')
    if big is not None:
        big = big.resize((400, 400), Image.LANCZOS); im.paste(big, (px + pw // 2 - 200, y0 + 70), big)
    d.line((px, y0 + 470, px + pw, y0 + 470), fill=LINE, width=2)
    d.line((px + pw // 2, y0 + 470, px + pw // 2, y0 + 1010), fill=LINE, width=2)
    d.line((px, y0 + 740, px + pw, y0 + 740), fill=LINE, width=2)
    for i, v in enumerate(('face34l', 'face34r', 'faceside', 'faceback')):
        img = load(cid, v)
        if img is None: continue
        img = img.resize((262, 262), Image.LANCZOS)
        im.paste(img, (px + (i % 2) * (pw // 2) + (pw // 4 - 131), y0 + 476 + (i // 2) * 270), img)
    if r < len(IDS) - 1:
        d.line((40, y0 + ROW_H - 4, W - 40, y0 + ROW_H - 4), fill=(110, 70, 200), width=2)
im.save(OUT, quality=95)
print('SHEET OK', OUT)
