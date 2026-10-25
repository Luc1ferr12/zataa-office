# Properti khas tiap tema kantor (hanya di latar render; dipasang di tempat yang tidak dilewati pegawai:
# dinding belakang di atas kepala, puncak dinding, pojok luar gedung, sekitar pohon, tiang lampu taman, pagar).
#   dipanggil toy_office.py: add_props(theme, ctx)  ctx = dict(D, TL, B, COLL, MODE, TREES, PALMS, POOL)
import bpy, math, random
from math import radians
from mathutils import Vector, Matrix

WALLS = [(-6, 0.0, 3.3), (-16, 3.6, 6.9), (-26, 7.2, 10.5)]   # (z dinding belakang, lantai, puncak) koordinat web
X0, X1 = -31.0, 31.0
STRUCT = {'plaster', 'ledge', 'ledgeDark', 'dark', 'slab', 'slat', 'tread', 'glassRail', 'glass', 'steel', 'grass', 'grassDark', 'rubble', 'deck'}

def _clutter(D):
    """kotak batas benda yang nempel di dinding belakang (TV, papan nama, rak) supaya properti tidak menimpa"""
    out = []
    for p in D['prims']:
        if p[1] in STRUCT: continue
        pts = p[2] if p[0] == 'p' else [[p[2][0] + sx * p[3][0], p[2][1] + sy * p[3][1], p[2][2]] for sx in (-1, 1) for sy in (-1, 1)]
        xs = [v[0] for v in pts]; ys = [v[1] for v in pts]; zs = [v[2] for v in pts]
        if max(xs) - min(xs) > 8: continue
        out.append((min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    return out

def wall_spots(D, step=3.0, half=0.55, y_lo=1.7, seed=1):
    """titik kosong di dinding belakang tiap lantai: (x, z_dinding, lantai, puncak)"""
    cl = _clutter(D); spots = []
    for wz, yb, yt in WALLS:
        x = X0 + 1.0
        while x < X1:
            busy = any(a[0] < x + half and a[1] > x - half and a[4] < wz + 0.9 and a[5] > wz - 0.2 and a[3] > yb + y_lo and a[2] < yt for a in cl)
            if not busy: spots.append((x, wz, yb, yt))
            x += step
    return spots

def catenary(a, b, sag, n=14):
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / (n - 1)) - Vector((0, sag * 4 * (i / (n - 1)) * (1 - i / (n - 1)), 0)) for i in range(n)]

def add_props(theme, ctx):
    fn = {'medieval': medieval, 'jungle': jungle, 'futuristic': futuristic, 'anime': anime, 'cartoon': cartoon, 'disney': disney}.get(theme)
    if fn: fn(ctx)

def _light(ctx, p, color, energy, size=0.25):
    ld = bpy.data.lights.new('pl', 'POINT'); ld.energy = energy * (1.8 if ctx['MODE'] == 'night' else 1.0); ld.color = color; ld.shadow_soft_size = size
    lo = bpy.data.objects.new('pl', ld); ctx['COLL'].objects.link(lo); lo.location = ctx['B'](p)

def _outdoor_lamps(ctx):
    return [l['p'] for l in ctx['D']['lights'] if l['p'][2] > 3.5 and l['p'][1] < 1.2]

def _flame(ctx, p, scale=1.0):
    TL, B = ctx['TL'], ctx['B']
    f1 = TL.mat('flame', '#ff8a1c', 0.5, emit=8.0); f2 = TL.mat('flame2', '#ffd36a', 0.5, emit=12.0)
    TL.ellipsoid('flame', B((p[0], p[1] + 0.1 * scale, p[2])), (0.1 * scale, 0.1 * scale, 0.2 * scale), f1, None)
    TL.ellipsoid('flame2', B((p[0], p[1] + 0.07 * scale, p[2] + 0.01)), (0.055 * scale, 0.055 * scale, 0.12 * scale), f2, None)
    _light(ctx, (p[0], p[1] + 0.3, p[2] + 0.3), (1.0, 0.55, 0.2), 60 * scale)

# ---------------------------------------------------------------- MEDIEVAL: obor dinding, panji kain + lambang Z, bendera pagar, benteng
def medieval(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    iron = TL.mat('iron', '#2b2622', 0.5, metal=0.6); wood = TL.mat('torchwood', '#5a3a22', 0.8)
    gold = TL.mat('mgold', '#d4a73a', 0.3, metal=0.8); stone = TL.mat('mstone', '#8f8574', 0.9)
    cloths = [TL.mat('banner1', '#7a1f2b', 0.8, sheen=0.5), TL.mat('banner2', '#4b2a7a', 0.8, sheen=0.5)]
    for i, (x, wz, yb, yt) in enumerate(wall_spots(D, 2.6)):
        if i % 2 == 0:   # obor: braket besi + gagang kayu miring + api
            TL.rbox('bracket', B((x, yb + 2.25, wz + 0.06)), (0.12, 0.1, 0.22), iron, 0.02)
            a, b = (x, yb + 2.2, wz + 0.1), (x, yb + 2.62, wz + 0.32)
            TL.capsule('torch', B(a), B(b), 0.045, wood, None, r2=0.06)
            TL.torus('torchring', B(b), B(b) - B(a), 0.065, 0.015, iron, None)
            _flame(ctx, (b[0], b[1] + 0.05, b[2]))
        else:   # panji: tongkat emas, kain, tepi emas, lambang Z
            m = cloths[(i // 2) % 2]; top = yt - 0.08; h = min(1.3, yt - yb - 1.95)
            TL.capsule('rod', B((x - 0.62, top, wz + 0.1)), B((x + 0.62, top, wz + 0.1)), 0.035, gold, None)
            TL.rbox('bannertrim', B((x, top - h / 2, wz + 0.07)), (1.0, 0.03, h + 0.05), gold, 0.01)
            TL.rbox('banner', B((x, top - h / 2, wz + 0.1)), (0.9, 0.03, h), m, 0.01)
            TL.zmark(B((x, top - h * 0.45, wz + 0.125)), 0.45, gold, None, normal=(0, -1, 0), r=0.04)
    for wz, yb, yt in WALLS[-1:]:   # benteng (merlon) di puncak gedung
        x = X0
        while x <= X1 + 0.5:
            TL.rbox('merlon', B((x, yt + 0.25, wz + 0.15)), (0.7, 0.5, 0.5), stone, 0.04); x += 1.4
    rnd = random.Random(5)
    for k, x in enumerate(range(-40, 46, 12)):   # bendera di pagar depan
        p0 = (x + rnd.uniform(-1, 1), 0, 30.4)
        TL.capsule('flagpole', B(p0), B((p0[0], 4.2, p0[2])), 0.05, wood, None)
        TL.ellipsoid('poletop', B((p0[0], 4.25, p0[2])), (0.09, 0.09, 0.09), gold, None)
        TL.rbox('flag', B((p0[0] + 0.55, 3.75, p0[2])), (1.0, 0.03, 0.6), cloths[k % 2], 0.02)
    for p in _outdoor_lamps(ctx):   # lampu taman jadi tiang obor
        TL.capsule('torchpost', B((p[0], 0, p[2])), B((p[0], p[1] + 0.35, p[2])), 0.07, wood, None)
        TL.frustum('brazier', B((p[0], p[1] + 0.42, p[2])), 0.12, 0.17, 0.14, iron, None, bevel=0.01)
        _flame(ctx, (p[0], p[1] + 0.5, p[2]), 1.3)

# ---------------------------------------------------------------- JUNGLE: sulur menjuntai, pakis, bunga tropis, lumut
def jungle(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    vine = TL.mat('vine', '#2f7a2a', 0.6, sheen=0.3); leaf = TL.mat('vleaf', '#3f9a36', 0.55, sheen=0.3)
    fern = TL.mat('fern', '#2d8a35', 0.55, sheen=0.3); moss = TL.mat('moss', '#4a8a2e', 0.9)
    flowers = [TL.mat('hibis1', '#e8344e', 0.5), TL.mat('hibis2', '#ff7aa8', 0.5), TL.mat('hibis3', '#ffb72e', 0.5)]
    rnd = random.Random(7)
    for wz, yb, yt in WALLS:   # sulur dari puncak dinding
        x = X0
        while x < X1:
            if rnd.random() < 0.55:
                L = rnd.uniform(0.6, min(1.4, yt - yb - 1.95))
                pts = [B((x, yt, wz + 0.12)), B((x + rnd.uniform(-0.1, 0.1), yt - L * 0.5, wz + 0.16)), B((x + rnd.uniform(-0.15, 0.15), yt - L, wz + 0.14))]
                TL.strand(pts, 0.035, 0.03, vine, None, center=B((x, yt - L / 2, wz - 1)), n=16, k=6, root=1.0, sub=1, wave=0.04, freq=2, phase=x)
                for j in range(int(L / 0.18)):
                    t = (j + 0.5) / (L / 0.18); q = (x + rnd.uniform(-0.08, 0.08), yt - L * t, wz + 0.16)
                    TL.ellipsoid('vleaf', B(q), (0.07, 0.025, 0.045), leaf, None, seg=12)
            x += rnd.uniform(0.35, 0.8)
        for k in range(int((X1 - X0) / 0.9)):   # lumut di puncak dinding
            TL.ellipsoid('moss', B((X0 + k * 0.9 + rnd.uniform(-0.2, 0.2), yt + 0.05, wz + 0.05)), (0.5, 0.25, 0.15), moss, None, seg=16)
    def fern_at(c, n=7, L=0.9):
        for i in range(n):
            a = i / n * 2 * math.pi + rnd.uniform(-0.2, 0.2); d = Vector((math.cos(a), 0, math.sin(a)))
            c_ = Vector(c); pts = [c_, c_ + d * L * 0.4 + Vector((0, 0.45, 0)), c_ + d * L * 0.85 + Vector((0, 0.35, 0)), c_ + d * L + Vector((0, 0.05, 0))]
            TL.strand([B(v) for v in pts], 0.16, 0.02, fern, None, center=B(c_ - Vector((0, 1, 0))), n=18, k=6, root=0.3, sub=1, wave=0.02, freq=7)
    for x, z, y0, y1, crowns in ctx['TREES']:   # pakis & bunga di kaki pohon, sulur dari kanopi
        fern_at((x + 0.4, y0, z + 0.3));
        for k in range(3):
            q = (x + rnd.uniform(-0.9, 0.9), y0 + 0.35, z + rnd.uniform(0.2, 0.9))
            TL.ellipsoid('hibiscus', B(q), (0.1, 0.1, 0.06), flowers[k % 3], None, seg=12)
        mc = max(crowns, key=lambda p: p[3][0]); c, r = mc[2], mc[3][0]
        for k in range(3):
            a = rnd.uniform(0, 2 * math.pi); s = (c[0] + math.cos(a) * r * 0.7, c[1] - mc[3][1] * 0.5, c[2] + math.sin(a) * r * 0.7)
            L = rnd.uniform(0.8, 1.6)
            TL.strand([B(s), B((s[0], s[1] - L * 0.5, s[2])), B((s[0] + 0.05, s[1] - L, s[2]))], 0.03, 0.03, vine, None, center=B((c[0], s[1], c[2])), n=14, k=6, root=1.0, sub=1, wave=0.03, freq=2)
    for p in _outdoor_lamps(ctx): fern_at((p[0] + 0.3, 0, p[2] + 0.3), 6, 0.7)

# ---------------------------------------------------------------- FUTURISTIK: lis neon, panel hologram, pilar cahaya, neon kolam
def futuristic(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    cyan = TL.mat('neonC', '#38e8ff', 0.3, emit=6.0); mag = TL.mat('neonM', '#ff3ad6', 0.3, emit=6.0)
    holo = TL.mat('holo', '#5ff0ff', 0.2, emit=2.5); holoB = TL.mat('holoB', '#a78bfa', 0.2, emit=3.0)
    white = TL.mat('pylon', '#eef2fa', 0.2, coat=0.8)
    for i, (wz, yb, yt) in enumerate(WALLS):
        m = cyan if i % 2 == 0 else mag
        TL.capsule('neontop', B((X0 - 0.8, yt - 0.08, wz + 0.06)), B((X1 + 0.8, yt - 0.08, wz + 0.06)), 0.035, m, None)
        TL.capsule('neonbase', B((X0 - 0.8, yb + 0.06, wz + 0.06)), B((X1 + 0.8, yb + 0.06, wz + 0.06)), 0.025, cyan if m is mag else mag, None)
    for i, (x, wz, yb, yt) in enumerate(wall_spots(D, 4.5)):
        if i % 2: continue
        y = yb + 2.55
        TL.rbox('holo', B((x, y, wz + 0.18)), (1.0, 0.01, 0.55), holo, 0.005)
        for j, hgt in enumerate((0.18, 0.32, 0.24, 0.42)):   # grafik batang
            TL.rbox('holobar', B((x - 0.3 + j * 0.2, y - 0.25 + hgt / 2, wz + 0.2)), (0.1, 0.01, hgt), holoB, 0.003)
    for p in _outdoor_lamps(ctx):
        TL.frustum('pylon', B((p[0], 0.75, p[2])), 0.07, 0.11, 1.5, white, None, bevel=0.02)
        TL.torus('pylonring', B((p[0], 1.35, p[2])), (0, 0, 1), 0.12, 0.022, cyan, None)
        TL.torus('pylonring2', B((p[0], 1.05, p[2])), (0, 0, 1), 0.13, 0.018, mag, None)
    P = ctx['POOL']
    if P:
        x0, x1, z0, z1 = P['x0'], P['x1'], P['z0'], P['z1']
        for a, b in (((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))):
            TL.capsule('poolneon', B((a[0], 0.06, a[1])), B((b[0], 0.06, b[1])), 0.04, cyan, None)

# ---------------------------------------------------------------- ANIME: lampion kertas merah-putih bertali, kelopak sakura di rumput
def anime(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    red = TL.mat('lantR', '#e8443a', 0.5, emit=1.2); wht = TL.mat('lantW', '#fff4e0', 0.5, emit=1.2)
    cap = TL.mat('lantCap', '#2a2238', 0.5); rope = TL.mat('rope', '#3a2a2a', 0.8)
    petal = TL.mat('petal', '#ffb7d0', 0.5)
    for wz, yb, yt in WALLS:
        ys = yt - 0.25; xs = [X0 + k * 3.1 for k in range(int((X1 - X0) / 3.1) + 1)]
        for a, b in zip(xs, xs[1:]):
            pts = catenary((a, ys, wz + 0.22), (b, ys, wz + 0.22), 0.35)
            for p, q in zip(pts, pts[1:]): TL.capsule('rope', B(p), B(q), 0.012, rope, None)
            mid = pts[len(pts) // 2]
            m = red if int(a) % 2 == 0 else wht
            TL.ellipsoid('lantern', B((mid[0], mid[1] - 0.28, mid[2])), (0.17, 0.17, 0.22), m, None, seg=24)
            for dy in (-0.07, 0.21):
                TL.frustum('lcap', B((mid[0], mid[1] - 0.28 + (-0.21 if dy < 0 else 0.21), mid[2])), 0.09, 0.09, 0.04, cap, None, bevel=0.01)
            _light(ctx, (mid[0], mid[1] - 0.3, mid[2] + 0.3), (1.0, 0.55, 0.45) if m is red else (1.0, 0.9, 0.75), 12)
    rnd = random.Random(3)
    for k in range(420):   # kelopak sakura di rumput taman
        x = rnd.uniform(-40, 46); z = rnd.uniform(4, 30)
        TL.ellipsoid('petal', B((x, 0.02, z)), (0.06, 0.04, 0.01), petal, None, seg=8)

# ---------------------------------------------------------------- CARTOON: bendera segitiga warna-warni, balon di pagar & lampu
def cartoon(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    cols = ['#ff3838', '#ffd32a', '#0abde3', '#10ac84', '#ff9f43', '#c56cf0']
    rope = TL.mat('crope', '#2d3436', 0.8)
    tris = {c: ([], []) for c in cols}
    for wz, yb, yt in WALLS:
        xs = [X0 + k * 4.0 for k in range(int((X1 - X0) / 4.0) + 1)]
        for a, b in zip(xs, xs[1:]):
            pts = catenary((a, yt - 0.1, wz + 0.15), (b, yt - 0.1, wz + 0.15), 0.4, 12)
            for p, q in zip(pts, pts[1:]): TL.capsule('crope', B(p), B(q), 0.015, rope, None)
            for i, p in enumerate(pts[1:-1]):
                c = cols[(i + int(a)) % len(cols)]; V, F = tris[c]; o = len(V)
                V += [tuple(B((p[0] - 0.17, p[1], p[2] + 0.01))), tuple(B((p[0] + 0.17, p[1], p[2] + 0.01))), tuple(B((p[0], p[1] - 0.42, p[2] + 0.01)))]
                F.append((o, o + 1, o + 2))
    for c, (V, F) in tris.items():
        if not V: continue
        me = bpy.data.meshes.new('bunting'); me.from_pydata(V, [], F)
        ob = bpy.data.objects.new('bunting', me); ctx['COLL'].objects.link(ob); me.materials.append(TL.mat('bunt' + c, c, 0.6))
        ob.modifiers.new('sol', 'SOLIDIFY').thickness = 0.02
    rnd = random.Random(9)
    string = TL.mat('bstring', '#f5f6fa', 0.5)
    spots = [(p[0], p[2]) for p in _outdoor_lamps(ctx)] + [(x, 30.4) for x in range(-40, 46, 14)]
    for x, z in spots:   # gerombolan balon
        top = (x, 2.4, z)
        for k in range(4):
            q = (x + rnd.uniform(-0.35, 0.35), 2.3 + rnd.uniform(0, 0.6), z + rnd.uniform(-0.3, 0.3))
            TL.capsule('bstring', B((x, 0.95, z)), B((q[0], q[1] - 0.25, q[2])), 0.008, string, None)
            TL.ellipsoid('balloon', B(q), (0.2, 0.2, 0.25), TL.mat('balloon' + str(k), cols[(k + int(x)) % len(cols)], 0.2, coat=1.0), None, seg=24)

# ---------------------------------------------------------------- DISNEY: menara istana di pojok, lampu peri, kilau emas
def disney(ctx):
    D, TL, B = ctx['D'], ctx['TL'], ctx['B']
    wall = TL.mat('castle', '#f6e3ef', 0.6); roof = TL.mat('castleRoof', '#7d6bd8', 0.4, coat=0.5)
    gold = TL.mat('dgold', '#f2c94c', 0.3, metal=0.8); flagm = TL.mat('dflag', '#ff8ac2', 0.6)
    win = TL.mat('cwin', '#ffd27a', 0.4, emit=2.5)
    for x, z, h, r in ((-33.4, -26.5, 14.0, 1.5), (33.4, -26.5, 14.0, 1.5), (-33.4, -6.2, 7.5, 1.1), (33.4, -6.2, 7.5, 1.1)):   # menara di pojok gedung
        TL.frustum('tower', B((x, h / 2, z)), r, r * 0.92, h, wall, None, bevel=0.06, seg=40)
        for k in range(8):   # benteng kecil di atas menara
            a = k / 8 * 2 * math.pi
            TL.rbox('tmerlon', B((x + math.cos(a) * r * 0.95, h + 0.2, z + math.sin(a) * r * 0.95)), (0.35, 0.35, 0.4), wall, 0.05)
        TL.frustum('troof', B((x, h + 1.4, z)), r * 1.12, 0.03, 2.6, roof, None, bevel=0.0, seg=40)
        TL.ellipsoid('finial', B((x, h + 2.75, z)), (0.1, 0.1, 0.1), gold, None)
        TL.capsule('tflagpole', B((x, h + 2.7, z)), B((x, h + 3.6, z)), 0.025, gold, None)
        TL.rbox('tflag', B((x + 0.32, h + 3.4, z)), (0.6, 0.02, 0.32), flagm, 0.02)
        for yy in (h * 0.45, h * 0.75):
            TL.rbox('twin', B((x, yy, z + r * 0.95)), (0.3, 0.06, 0.55), win, 0.05)
    bulb = TL.mat('fairy', '#ffe2a0', 0.3, emit=9.0); wire = TL.mat('fwire', '#5a4a3a', 0.6)
    for wz, yb, yt in WALLS:   # untaian lampu peri
        xs = [X0 + k * 2.2 for k in range(int((X1 - X0) / 2.2) + 1)]
        for a, b in zip(xs, xs[1:]):
            pts = catenary((a, yt - 0.12, wz + 0.12), (b, yt - 0.12, wz + 0.12), 0.25, 10)
            for p, q in zip(pts, pts[1:]): TL.capsule('fwire', B(p), B(q), 0.008, wire, None)
            for p in pts[1:-1:2]: TL.ellipsoid('fairy', B((p[0], p[1] - 0.04, p[2])), (0.035, 0.035, 0.045), bulb, None, seg=10)
    sp = TL.mat('sparkle', '#fff2b0', 0.3, emit=10.0); rnd = random.Random(11)
    for k in range(60):   # kilau emas melayang di taman
        q = (rnd.uniform(-38, 44), rnd.uniform(0.8, 3.0), rnd.uniform(5, 29))
        for ax in ((0.12, 0.012, 0.012), (0.012, 0.012, 0.12)):
            TL.ellipsoid('sparkle', B(q), ax, sp, None, seg=8)
